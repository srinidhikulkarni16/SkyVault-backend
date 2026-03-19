const supabase = require("../config/supabaseClient");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "drive";

/*  SHARE WITH USER */
// Frontend sends: { resource_type, resource_id, user_email, role }
exports.shareWithUser = async (req, res) => {
  try {
    const userId = req.user.id;
    // Support both snake_case (frontend) and camelCase (old code)
    const resourceType  = req.body.resource_type  || req.body.resourceType;
    const resourceId    = req.body.resource_id    || req.body.resourceId;
    const userEmail     = req.body.user_email     || req.body.userEmail;
    const granteeUserId = req.body.grantee_user_id || req.body.granteeUserId;
    const role          = req.body.role || "viewer";

    if (!resourceType || !resourceId || (!userEmail && !granteeUserId)) {
      return res.status(400).json({ message: "resource_type, resource_id, and user_email are required" });
    }

    // Verify ownership
    const table = resourceType === "file" ? "files" : "folders";
    const { data: resource } = await supabase
      .from(table)
      .select("owner_id")
      .eq("id", resourceId)
      .eq("is_deleted", false)
      .single();

    if (!resource) return res.status(404).json({ message: "Resource not found" });
    if (resource.owner_id !== userId) return res.status(403).json({ message: "Only the owner can share" });

    // Resolve grantee by email if not provided by ID
    let granteeId = granteeUserId;
    if (!granteeId && userEmail) {
      const { data: grantee } = await supabase
        .from("users")
        .select("id")
        .eq("email", userEmail.toLowerCase())
        .single();

      if (!grantee) return res.status(404).json({ message: "No user found with that email" });
      granteeId = grantee.id;
    }

    if (granteeId === userId) return res.status(400).json({ message: "Cannot share with yourself" });

    // Upsert share
    const { data, error } = await supabase
      .from("shares")
      .upsert([{
        resource_type:   resourceType,
        resource_id:     resourceId,
        grantee_user_id: granteeId,
        role,
        created_by:      userId,
      }], { onConflict: "resource_type,resource_id,grantee_user_id" })
      .select()
      .single();

    if (error) return res.status(400).json({ message: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  CREATE PUBLIC LINK */
exports.createPublicLink = async (req, res) => {
  try {
    const userId        = req.user.id;
    const resourceType  = req.body.resource_type || req.body.resourceType;
    const resourceId    = req.body.resource_id   || req.body.resourceId;
    const expiresAt     = req.body.expires_at    || req.body.expiresAt    || null;
    const password      = req.body.password      || null;

    // Verify ownership
    const table = resourceType === "file" ? "files" : "folders";
    const { data: resource } = await supabase
      .from(table)
      .select("owner_id")
      .eq("id", resourceId)
      .eq("is_deleted", false)
      .single();

    if (!resource) return res.status(404).json({ message: "Resource not found" });
    if (resource.owner_id !== userId) return res.status(403).json({ message: "Only the owner can create links" });

    const token        = uuidv4();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const { data, error } = await supabase
      .from("link_shares")
      .insert([{
        resource_type: resourceType,
        resource_id:   resourceId,
        token,
        password_hash: passwordHash,
        expires_at:    expiresAt,
        created_by:    userId,
      }])
      .select()
      .single();

    if (error) return res.status(400).json({ message: error.message });
    res.json({ ...data, link: `${process.env.FRONTEND_URL || "http://localhost:5173"}/share/${token}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  GET SHARES FOR RESOURCE */
exports.getShares = async (req, res) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const table = type === "file" ? "files" : "folders";
    const { data: resource } = await supabase
      .from(table)
      .select("owner_id")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (!resource || resource.owner_id !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [sharesRes, linksRes] = await Promise.all([
      supabase
        .from("shares")
        .select("id, role, created_at, grantee_user_id, users:grantee_user_id(id, email, name)")
        .eq("resource_type", type)
        .eq("resource_id", id),
      supabase
        .from("link_shares")
        .select("id, token, role, expires_at, created_at, password_hash")
        .eq("resource_type", type)
        .eq("resource_id", id),
    ]);

    // Flatten user shares for frontend
    const userShares = (sharesRes.data || []).map((s) => ({
      id:         s.id,
      role:       s.role,
      created_at: s.created_at,
      user_id:    s.grantee_user_id,
      user_name:  s.users?.name,
      user_email: s.users?.email,
    }));

    // Mark whether link has password (don't expose the hash)
    const linkShares = (linksRes.data || []).map(({ password_hash, ...link }) => ({
      ...link,
      has_password: !!password_hash,
    }));

    res.json({ userShares, linkShares });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  REVOKE USER SHARE */
exports.revokeShare = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: share } = await supabase
      .from("shares")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!share) return res.status(404).json({ message: "Share not found" });
    if (share.created_by !== userId) return res.status(403).json({ message: "Access denied" });

    const { error } = await supabase.from("shares").delete().eq("id", id);
    if (error) return res.status(400).json({ message: error.message });
    res.json({ message: "Share revoked" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  DELETE PUBLIC LINK */
exports.deletePublicLink = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: link } = await supabase
      .from("link_shares")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!link || link.created_by !== userId) return res.status(403).json({ message: "Access denied" });

    const { error } = await supabase.from("link_shares").delete().eq("id", id);
    if (error) return res.status(400).json({ message: error.message });
    res.json({ message: "Link deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  ACCESS VIA PUBLIC LINK */
exports.accessPublicLink = async (req, res) => {
  try {
    const { token }  = req.params;
    const { password } = req.query; // frontend sends as query param

    const { data: link, error } = await supabase
      .from("link_shares")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !link) return res.status(404).json({ message: "Invalid or expired link" });

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ message: "Link has expired" });
    }

    // Check password
    if (link.password_hash) {
      if (!password) return res.status(401).json({ requiresPassword: true, message: "Password required" });
      const valid = await bcrypt.compare(password, link.password_hash);
      if (!valid) return res.status(401).json({ message: "Incorrect password" });
    }

    const table = link.resource_type === "file" ? "files" : "folders";
    const { data: resource } = await supabase
      .from(table)
      .select("*")
      .eq("id", link.resource_id)
      .eq("is_deleted", false)
      .single();

    if (!resource) return res.status(404).json({ message: "Resource not found or deleted" });

    // Fetch owner info
    const { data: owner } = await supabase
      .from("users")
      .select("name, email")
      .eq("id", resource.owner_id)
      .single();

    let downloadUrl = null;
    if (link.resource_type === "file") {
      const storageKey = resource.storage_key || resource.storage_path;
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storageKey, 3600);
      downloadUrl = signed?.signedUrl;
    }

    res.json({
      type:        link.resource_type,
      resource,
      owner:       owner || { name: "Unknown" },
      downloadUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};