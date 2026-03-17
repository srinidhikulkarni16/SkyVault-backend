const supabase = require("../config/supabaseClient");
const { v4: uuidv4 } = require("uuid");

exports.shareWithUser = async (req, res) => {
  try {
    const { resourceType, resourceId, granteeUserId, role } = req.body;
    const userId = req.user.id;

    // Verify ownership before allowing share
    const table = resourceType === 'file' ? 'files' : 'folders';
    const { data: resource, error: resourceError } = await supabase
      .from(table)
      .select("owner_id")
      .eq("id", resourceId)
      .eq("is_deleted", false)
      .single();

    if (resourceError || !resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    if (resource.owner_id !== userId) {
      return res.status(403).json({ message: "Only the owner can share this resource" });
    }

    // Check if user is trying to share with themselves
    if (granteeUserId === userId) {
      return res.status(400).json({ message: "Cannot share with yourself" });
    }

    // Verify grantee user exists
    const { data: granteeUser } = await supabase
      .from("users")
      .select("id")
      .eq("id", granteeUserId)
      .single();

    if (!granteeUser) {
      return res.status(404).json({ message: "User to share with not found" });
    }

    // Create or update the share
    const { data, error } = await supabase
      .from("shares")
      .upsert([{
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_user_id: granteeUserId,
        role,
        created_by: userId
      }], {
        onConflict: 'resource_type,resource_id,grantee_user_id'
      })
      .select()
      .single();

    if (error) return res.status(400).json(error);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createPublicLink = async (req, res) => {
  try {
    const { resourceType, resourceId, expiresAt, password } = req.body;
    const userId = req.user.id;

    // ADDED: Verify ownership before creating public link
    const table = resourceType === 'file' ? 'files' : 'folders';
    const { data: resource, error: resourceError } = await supabase
      .from(table)
      .select("owner_id")
      .eq("id", resourceId)
      .eq("is_deleted", false)
      .single();

    if (resourceError || !resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    if (resource.owner_id !== userId) {
      return res.status(403).json({ message: "Only the owner can create public links" });
    }

    const token = uuidv4();

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      const bcrypt = require('bcrypt');
      passwordHash = await bcrypt.hash(password, 10);
    }

    const { data, error } = await supabase
      .from("link_shares")
      .insert([{ 
        resource_type: resourceType, 
        resource_id: resourceId, 
        token,
        password_hash: passwordHash,
        expires_at: expiresAt || null,
        created_by: userId
      }])
      .select()
      .single();

    if (error) return res.status(400).json(error);
    res.json({ link: `${process.env.FRONTEND_URL}/share/${token}`, token, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all shares for a resource
exports.getShares = async (req, res) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const table = type === 'file' ? 'files' : 'folders';
    const { data: resource } = await supabase
      .from(table)
      .select("owner_id")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (!resource || resource.owner_id !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get user shares
    const { data: userShares } = await supabase
      .from("shares")
      .select(`
        *,
        users:grantee_user_id (id, email, name)
      `)
      .eq("resource_type", type)
      .eq("resource_id", id);

    // Get link shares
    const { data: linkShares } = await supabase
      .from("link_shares")
      .select("*")
      .eq("resource_type", type)
      .eq("resource_id", id);

    res.json({ userShares: userShares || [], linkShares: linkShares || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Revoke user share
exports.revokeShare = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get share info to verify ownership
    const { data: share } = await supabase
      .from("shares")
      .select("*, files!inner(owner_id), folders!inner(owner_id)")
      .eq("id", id)
      .single();

    if (!share) {
      return res.status(404).json({ message: "Share not found" });
    }

    // Check if user is the creator or resource owner
    const isOwner = share.created_by === userId;
    if (!isOwner) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { error } = await supabase
      .from("shares")
      .delete()
      .eq("id", id);

    if (error) return res.status(400).json(error);
    res.json({ message: "Share revoked successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete public link
exports.deletePublicLink = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: linkShare } = await supabase
      .from("link_shares")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!linkShare || linkShare.created_by !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { error } = await supabase
      .from("link_shares")
      .delete()
      .eq("id", id);

    if (error) return res.status(400).json(error);
    res.json({ message: "Public link deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Access resource via public link
exports.accessPublicLink = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const { data: linkShare, error } = await supabase
      .from("link_shares")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !linkShare) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }

    // Check expiration
    if (linkShare.expires_at && new Date(linkShare.expires_at) < new Date()) {
      return res.status(410).json({ message: "Link has expired" });
    }

    // Check password if required
    if (linkShare.password_hash) {
      if (!password) {
        return res.status(401).json({ message: "Password required", requiresPassword: true });
      }
      const bcrypt = require('bcrypt');
      const valid = await bcrypt.compare(password, linkShare.password_hash);
      if (!valid) {
        return res.status(401).json({ message: "Incorrect password" });
      }
    }

    // Get the resource
    const table = linkShare.resource_type === 'file' ? 'files' : 'folders';
    const { data: resource } = await supabase
      .from(table)
      .select("*")
      .eq("id", linkShare.resource_id)
      .eq("is_deleted", false)
      .single();

    if (!resource) {
      return res.status(404).json({ message: "Resource not found or deleted" });
    }

    // For files, generate download URL
    if (linkShare.resource_type === 'file') {
      const { data: signedUrl } = await supabase.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET)
        .createSignedUrl(resource.storage_path, 3600); // 1 hour

      res.json({ 
        resource, 
        downloadUrl: signedUrl?.signedUrl,
        resourceType: linkShare.resource_type 
      });
    } else {
      res.json({ resource, resourceType: linkShare.resource_type });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};