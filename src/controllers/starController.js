const supabase = require("../config/supabaseClient");

/* ── STAR ITEM ───────────────────────────────────────────────────────────────*/
// Frontend sends: { resource_type, resource_id }
exports.starItem = async (req, res) => {
  try {
    const userId       = req.user.id;
    const resourceType = req.body.resource_type || req.body.resourceType;
    const resourceId   = req.body.resource_id   || req.body.resourceId;

    if (!resourceType || !resourceId) {
      return res.status(400).json({ message: "resource_type and resource_id required" });
    }

    const table = resourceType === "file" ? "files" : "folders";
    const { data: resource } = await supabase
      .from(table)
      .select("id, owner_id")
      .eq("id", resourceId)
      .eq("is_deleted", false)
      .single();

    if (!resource) return res.status(404).json({ message: "Resource not found" });

    // Check access
    let hasAccess = resource.owner_id === userId;
    if (!hasAccess) {
      const { data: share } = await supabase
        .from("shares")
        .select("id")
        .eq("resource_type", resourceType)
        .eq("resource_id", resourceId)
        .eq("grantee_user_id", userId)
        .single();
      hasAccess = !!share;
    }
    if (!hasAccess) return res.status(403).json({ message: "Access denied" });

    // Upsert (ignore if already starred)
    const { error } = await supabase
      .from("stars")
      .upsert([{ user_id: userId, resource_type: resourceType, resource_id: resourceId }], {
        onConflict: "user_id,resource_type,resource_id",
        ignoreDuplicates: true,
      });

    if (error) return res.status(400).json({ message: error.message });
    res.status(201).json({ message: "Starred" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── UNSTAR ITEM ─────────────────────────────────────────────────────────────*/
// Frontend calls DELETE /api/stars/:type/:id  OR  DELETE /api/stars with body
exports.unstarItem = async (req, res) => {
  try {
    const userId       = req.user.id;
    // Support params (/:type/:id) and body ({ resource_type, resource_id })
    const resourceType = req.params.type || req.body.resource_type;
    const resourceId   = req.params.id   || req.body.resource_id;

    const { error } = await supabase
      .from("stars")
      .delete()
      .eq("user_id", userId)
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId);

    if (error) return res.status(400).json({ message: error.message });
    res.json({ message: "Unstarred" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET STARRED ITEMS ───────────────────────────────────────────────────────*/
// Returns a flat array with each item having a `type` field
// e.g. [{ id, name, type: 'file', is_starred: true, ... }, ...]
exports.getStarredItems = async (req, res) => {
  try {
    const userId = req.user.id;

    const [filesRes, foldersRes] = await Promise.all([
      supabase
        .from("stars")
        .select("resource_id, files!inner(*)")
        .eq("user_id", userId)
        .eq("resource_type", "file")
        .eq("files.is_deleted", false),
      supabase
        .from("stars")
        .select("resource_id, folders!inner(*)")
        .eq("user_id", userId)
        .eq("resource_type", "folder")
        .eq("folders.is_deleted", false),
    ]);

    const files   = (filesRes.data   || []).map((s) => ({ ...s.files,   type: "file",   is_starred: true }));
    const folders = (foldersRes.data || []).map((s) => ({ ...s.folders, type: "folder", is_starred: true }));

    res.json([...folders, ...files]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};