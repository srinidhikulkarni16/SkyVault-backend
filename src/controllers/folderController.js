const supabase = require("../config/supabaseClient");

/* CREATE FOLDER */
const createFolder = async (req, res) => {
  try {
    const { name, parent_id } = req.body;

    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: "Folder name is required" });
    }

    // Verify parent folder exists if parent_id provided
    if (parent_id) {
      const { data: parent, error: parentError } = await supabase
        .from("folders")
        .select("id")
        .eq("id", parent_id)
        .eq("owner_id", req.user.id)
        .eq("is_deleted", false)
        .single();

      if (parentError || !parent) {
        return res.status(404).json({ message: "Parent folder not found or no permission" });
      }
    }

    // Check for duplicate name in same parent
    const { data: existing } = await supabase
      .from("folders")
      .select("id")
      .eq("name", name.trim())
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .eq("parent_id", parent_id || null)
      .single();

    if (existing) {
      return res.status(409).json({ message: "A folder with this name already exists in this location" });
    }

    // Create folder
    const { data, error } = await supabase
      .from("folders")
      .insert([{
        name: name.trim(),
        parent_id: parent_id || null,
        owner_id: req.user.id,
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) return res.status(400).json(error);

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  GET FOLDERS  */
const getFolders = async (req, res) => {
  try {
    const { parent_id } = req.query;

    let query = supabase
      .from("folders")
      .select("*")
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .order("name", { ascending: true });

    if (parent_id !== undefined) {
      if (parent_id === 'root' || parent_id === '') {
        query = query.is("parent_id", null);
      } else {
        query = query.eq("parent_id", parent_id);
      }
    }

    const { data, error } = await query;
    if (error) return res.status(400).json(error);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  RENAME FOLDER  */
const renameFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: "Folder name is required" });
    }

    // Get folder to check ownership and parent
    const { data: folder, error: fetchError } = await supabase
      .from("folders")
      .select("*")
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !folder) {
      return res.status(404).json({ message: "Folder not found or no permission" });
    }

    // Check for duplicate name in same parent
    const { data: existing } = await supabase
      .from("folders")
      .select("id")
      .eq("name", name.trim())
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .eq("parent_id", folder.parent_id)
      .neq("id", id) // Exclude current folder
      .single();

    if (existing) {
      return res.status(409).json({ message: "A folder with this name already exists in this location" });
    }

    // Update folder
    const { error: updateError } = await supabase
      .from("folders")
      .update({ name: name.trim(), updated_at: new Date() })
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (updateError) return res.status(400).json(updateError);

    res.json({ message: "Folder renamed successfully", folder: { ...folder, name: name.trim() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* DELETE FOLDER */
const deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: folder, error: fetchError } = await supabase
      .from("folders")
      .select("id")
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !folder) {
      return res.status(404).json({ message: "Folder not found or already deleted" });
    }

    // Soft delete the folder
    const { error } = await supabase
      .from("folders")
      .update({ is_deleted: true, deleted_at: new Date() })
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (error) return res.status(400).json(error);

    // Also soft delete all files in this folder
    await supabase
      .from("files")
      .update({ is_deleted: true, deleted_at: new Date() })
      .eq("folder_id", id)
      .eq("owner_id", req.user.id);

    // Recursively delete child folders 
    const { data: childFolders } = await supabase
      .from("folders")
      .select("id")
      .eq("parent_id", id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false);

    if (childFolders && childFolders.length > 0) {
      for (const child of childFolders) {
        await supabase
          .from("folders")
          .update({ is_deleted: true, deleted_at: new Date() })
          .eq("id", child.id);
      }
    }

    res.json({ message: "Folder moved to trash" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* MOVE FOLDER */
const moveFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { parent_id } = req.body;

    // Get folder to verify ownership
    const { data: folder, error: fetchError } = await supabase
      .from("folders")
      .select("*")
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !folder) {
      return res.status(404).json({ message: "Folder not found or no permission" });
    }

    // Prevent moving to itself
    if (parent_id === id) {
      return res.status(400).json({ message: "Cannot move folder into itself" });
    }

    // If parent_id is provided, verify it exists and check for cycles
    if (parent_id) {
      const { data: parent, error: parentError } = await supabase
        .from("folders")
        .select("id")
        .eq("id", parent_id)
        .eq("owner_id", req.user.id)
        .eq("is_deleted", false)
        .single();

      if (parentError || !parent) {
        return res.status(404).json({ message: "Target folder not found" });
      }

      // Check if target is a descendant (would create cycle)
      const isDescendant = await checkIsDescendant(id, parent_id);
      if (isDescendant) {
        return res.status(400).json({ message: "Cannot move folder into its own descendant" });
      }
    }

    // Check for duplicate name in target location
    const { data: existing } = await supabase
      .from("folders")
      .select("id")
      .eq("name", folder.name)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .eq("parent_id", parent_id || null)
      .neq("id", id)
      .single();

    if (existing) {
      return res.status(409).json({ message: "A folder with this name already exists in the target location" });
    }

    // Move folder
    const { error: updateError } = await supabase
      .from("folders")
      .update({ parent_id: parent_id || null, updated_at: new Date() })
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (updateError) return res.status(400).json(updateError);

    res.json({ message: "Folder moved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  Check if folder is descendant */
async function checkIsDescendant(folderId, potentialDescendantId) {
  let currentId = potentialDescendantId;
  
  while (currentId) {
    if (currentId === folderId) return true;
    
    const { data: folder } = await supabase
      .from("folders")
      .select("parent_id")
      .eq("id", currentId)
      .single();
    
    currentId = folder?.parent_id;
  }
  
  return false;
}

/* EXPORT CONTROLLERS */
module.exports = {
  createFolder,
  getFolders,
  renameFolder,
  deleteFolder,
  moveFolder
};