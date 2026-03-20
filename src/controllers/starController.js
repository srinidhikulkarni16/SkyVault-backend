const supabase = require("../config/supabaseClient");

/*  STAR ITEM */
exports.starItem = async (req, res) => {
  try {
    const userId       = req.user.id;
    const resourceType = req.body.resource_type || req.body.resourceType;
    const resourceId   = req.body.resource_id   || req.body.resourceId;

    console.log("[starItem] userId:", userId, "type:", resourceType, "id:", resourceId);

    if (!resourceType || !resourceId) {
      return res.status(400).json({ message: "resource_type and resource_id required" });
    }

    const table = resourceType === "file" ? "files" : "folders";
    const { data: resource, error: resErr } = await supabase
      .from(table)
      .select("id, owner_id")
      .eq("id", resourceId)
      .eq("is_deleted", false)
      .single();

    console.log("[starItem] resource lookup:", resource, resErr);

    if (!resource) return res.status(404).json({ message: "Resource not found" });

    // Check ownership or shared access
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

    const { error } = await supabase
      .from("stars")
      .upsert(
        [{ user_id: userId, resource_type: resourceType, resource_id: resourceId }],
        { onConflict: "user_id,resource_type,resource_id", ignoreDuplicates: true }
      );

    console.log("[starItem] upsert error:", error);

    if (error) return res.status(400).json({ message: error.message });
    res.status(201).json({ message: "Starred" });
  } catch (err) {
    console.error("[starItem] exception:", err);
    res.status(500).json({ error: err.message });
  }
};

/*  UNSTAR ITEM */
exports.unstarItem = async (req, res) => {
  try {
    const userId       = req.user.id;
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

/*  GET STARRED ITEMS */
// Uses explicit ID lookup instead of FK join — works even without FK constraints
exports.getStarredItems = async (req, res) => {
  try {
    const userId = req.user.id;

    //  Get all star rows for this user
    const { data: stars, error: starsErr } = await supabase
      .from("stars")
      .select("resource_id, resource_type")
      .eq("user_id", userId);

    console.log("[getStarredItems] stars:", stars, starsErr);

    if (starsErr) return res.status(400).json({ message: starsErr.message });
    if (!stars || stars.length === 0) return res.json([]);

    //  Split into file IDs and folder IDs
    const fileIds   = stars.filter(s => s.resource_type === "file").map(s => s.resource_id);
    const folderIds = stars.filter(s => s.resource_type === "folder").map(s => s.resource_id);

    //  Fetch the actual records using .in()
    const [filesRes, foldersRes] = await Promise.all([
      fileIds.length > 0
        ? supabase.from("files").select("*").in("id", fileIds).eq("is_deleted", false)
        : Promise.resolve({ data: [] }),
      folderIds.length > 0
        ? supabase.from("folders").select("*").in("id", folderIds).eq("is_deleted", false)
        : Promise.resolve({ data: [] }),
    ]);

    console.log("[getStarredItems] files:", filesRes.data, "folders:", foldersRes.data);

    const files   = (filesRes.data   || []).map(f => ({ ...f, type: "file",   is_starred: true }));
    const folders = (foldersRes.data || []).map(f => ({ ...f, type: "folder", is_starred: true }));

    res.json([...folders, ...files]);
  } catch (err) {
    console.error("[getStarredItems] exception:", err);
    res.status(500).json({ error: err.message });
  }
};