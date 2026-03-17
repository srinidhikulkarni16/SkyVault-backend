const supabase = require("../config/supabaseClient");

exports.starItem = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.body;
    
    // Verify resource exists and user has access
    const table = resourceType === 'file' ? 'files' : 'folders';
    const { data: resource } = await supabase
      .from(table)
      .select("id, owner_id")
      .eq("id", resourceId)
      .eq("is_deleted", false)
      .single();

    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    // Check if user owns it or has access via share
    let hasAccess = resource.owner_id === req.user.id;
    
    if (!hasAccess) {
      const { data: share } = await supabase
        .from("shares")
        .select("id")
        .eq("resource_type", resourceType)
        .eq("resource_id", resourceId)
        .eq("grantee_user_id", req.user.id)
        .single();
      hasAccess = !!share;
    }

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if already starred
    const { data: existing } = await supabase
      .from("stars")
      .select("*")
      .eq("user_id", req.user.id)
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .single();

    if (existing) {
      return res.status(409).json({ message: "Item already starred" });
    }

    const { error } = await supabase
      .from("stars")
      .insert([{ user_id: req.user.id, resource_type: resourceType, resource_id: resourceId }]);

    if (error) return res.status(400).json(error);
    res.status(201).json({ message: "Starred" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.unstarItem = async (req, res) => {
  try {
    const { type, id } = req.params;
    const { error } = await supabase
      .from("stars")
      .delete()
      .eq("user_id", req.user.id)
      .eq("resource_type", type)
      .eq("resource_id", id);

    if (error) return res.status(400).json(error);
    res.json({ message: "Unstarred" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all starred items for current user
exports.getStarredItems = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get starred files
    const { data: starredFiles } = await supabase
      .from("stars")
      .select(`
        *,
        files!inner (*)
      `)
      .eq("user_id", userId)
      .eq("resource_type", "file")
      .eq("files.is_deleted", false);

    // Get starred folders
    const { data: starredFolders } = await supabase
      .from("stars")
      .select(`
        *,
        folders!inner (*)
      `)
      .eq("user_id", userId)
      .eq("resource_type", "folder")
      .eq("folders.is_deleted", false);

    res.json({
      files: starredFiles?.map(s => s.files) || [],
      folders: starredFolders?.map(s => s.folders) || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};