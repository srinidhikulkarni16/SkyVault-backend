const supabase = require("../config/supabaseClient");

/* UPLOAD FILE */
const uploadFile = async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user.id;
    const { folder_id } = req.body; // Allow specifying folder on upload

    if (!file) return res.status(400).json({ message: "No file uploaded" });

    // Verify folder exists if folder_id provided
    if (folder_id) {
      const { data: folder } = await supabase
        .from("folders")
        .select("id")
        .eq("id", folder_id)
        .eq("owner_id", userId)
        .eq("is_deleted", false)
        .single();

      if (!folder) {
        return res.status(404).json({ message: "Target folder not found" });
      }
    }

    const path = `${userId}/${Date.now()}-${file.originalname}`;

    const { error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype });

    if (uploadError) return res.status(500).json(uploadError);

    const { data, error } = await supabase
      .from("files")
      .insert([{
        name: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size,
        storage_path: path,
        owner_id: userId,
        folder_id: folder_id || null //Set folder if provided
      }])
      .select();

    if (error) return res.status(400).json(error);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET FILES */
const getFiles = async (req, res) => {
  try {
    const { folder_id } = req.query;

    let query = supabase
      .from("files")
      .select("*")
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false);

    if (folder_id) query = query.eq("folder_id", folder_id);
    else query = query.is("folder_id", null);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return res.status(400).json(error);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET RECENT FILES */
const getRecentFiles = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("files")
      .select("*")
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return res.status(400).json(error);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* RENAME FILE */
const renameFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "File name required" });

    const { data: file, error: fetchError } = await supabase
      .from("files")
      .select("*")
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !file) return res.status(404).json({ message: "File not found or no permission" });

    const { error: updateError } = await supabase
      .from("files")
      .update({ name, updated_at: new Date() })
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (updateError) return res.status(400).json(updateError);
    res.json({ message: "Renamed successfully", file: { ...file, name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* MOVE FILE */
const moveFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { folder_id } = req.body;

    // Get file to verify ownership
    const { data: file, error: fetchError } = await supabase
      .from("files")
      .select("*")
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !file) {
      return res.status(404).json({ message: "File not found or no permission" });
    }

    // If folder_id is provided, verify it exists
    if (folder_id) {
      const { data: folder, error: folderError } = await supabase
        .from("folders")
        .select("id")
        .eq("id", folder_id)
        .eq("owner_id", req.user.id)
        .eq("is_deleted", false)
        .single();

      if (folderError || !folder) {
        return res.status(404).json({ message: "Target folder not found" });
      }
    }

    // Check for duplicate name in target location
    const { data: existing } = await supabase
      .from("files")
      .select("id")
      .eq("name", file.name)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .eq("folder_id", folder_id || null)
      .neq("id", id)
      .single();

    if (existing) {
      return res.status(409).json({ message: "A file with this name already exists in the target location" });
    }

    // Move file
    const { error: updateError } = await supabase
      .from("files")
      .update({ folder_id: folder_id || null, updated_at: new Date() })
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (updateError) return res.status(400).json(updateError);

    res.json({ message: "File moved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* DELETE FILE */
const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: file, error: fetchError } = await supabase
      .from("files")
      .select("id")
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !file) return res.status(404).json({ message: "File not found or already deleted" });

    const { error } = await supabase
      .from("files")
      .update({ is_deleted: true, deleted_at: new Date() })
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (error) return res.status(400).json(error);
    res.json({ message: "File moved to trash" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* DOWNLOAD FILE */
const downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: file, error } = await supabase
      .from("files")
      .select("*")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (error || !file) return res.status(404).json({ message: "File not found" });

    let hasAccess = file.owner_id === userId;

    if (!hasAccess) {
      const { data: share } = await supabase
        .from("shares")
        .select("id")
        .eq("resource_type", "file")
        .eq("resource_id", id)
        .eq("grantee_user_id", userId)
        .single();
      hasAccess = !!share;
    }

    if (!hasAccess) return res.status(403).json({ message: "No permission to download" });

    const { data, error: urlError } = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET)
      .createSignedUrl(file.storage_path, 60);

    if (urlError) return res.status(500).json({ message: "Failed to generate download URL" });

    await supabase.from("activities").insert({
      actor_id: userId,
      action: "download",
      resource_type: "file",
      resource_id: id
    });

    res.json({ url: data.signedUrl, fileName: file.name, size: file.size_bytes, mimeType: file.mime_type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*EXPORT ALL*/
module.exports = {
  uploadFile,
  getFiles,
  getRecentFiles,
  renameFile,
  moveFile,
  deleteFile,
  downloadFile
};