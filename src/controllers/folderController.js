const supabase = require("../config/supabaseClient");

/* CREATE FOLDER */
const createFolder = async (req, res) => {
  try {
    const { name, parent_id } = req.body;
    
    // 1. Clean parent_id: Convert empty strings to null for UUID compatibility
    const folderParentId = (parent_id && parent_id !== 'root' && parent_id !== '') ? parent_id : null;

    if (!name?.trim()) return res.status(400).json({ message: "Folder name is required" });

    // 2. If nesting, verify parent exists and belongs to user
    if (folderParentId) {
      const { data: parent } = await supabase.from("folders").select("id")
        .eq("id", folderParentId)
        .eq("owner_id", req.user.id)
        .eq("is_deleted", false)
        .single();
      if (!parent) return res.status(404).json({ message: "Parent folder not found" });
    }

    // 3. Duplicate name check in the same directory
    const { data: existing } = await supabase.from("folders").select("id")
      .eq("name", name.trim())
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .is("parent_id", folderParentId) // .is handles NULL correctly in Supabase
      .single();
    
    if (existing) return res.status(409).json({ message: "A folder with this name already exists here" });

    // 4. Insert with explicit owner_id
    const { data, error } = await supabase.from("folders")
      .insert([{ 
        name: name.trim(), 
        parent_id: folderParentId, 
        owner_id: req.user.id,
        is_deleted: false 
      }])
      .select().single();

    if (error) return res.status(400).json({ message: error.message });
    res.status(201).json(data);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

/* GET FOLDERS */
const getFolders = async (req, res) => {
  try {
    const { parent_id } = req.query;
    
    // Convert 'root' or empty strings to null for the query
    const folderParentId = (parent_id && parent_id !== 'root' && parent_id !== '') ? parent_id : null;

    let query = supabase.from("folders").select("*")
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .order("name", { ascending: true });

    if (folderParentId) {
      query = query.eq("parent_id", folderParentId);
    } else {
      query = query.is("parent_id", null);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ message: error.message });
    res.json(data || []);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

/* RENAME FOLDER */
const renameFolder = async (req, res) => {
  try {
    const { id }   = req.params;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Folder name is required" });

    const { data: folder } = await supabase.from("folders").select("*")
      .eq("id", id).eq("owner_id", req.user.id).eq("is_deleted", false).single();
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    const { data: existing } = await supabase.from("folders").select("id")
      .eq("name", name.trim()).eq("owner_id", req.user.id).eq("is_deleted", false)
      .is("parent_id", folder.parent_id).neq("id", id).single();
    if (existing) return res.status(409).json({ message: "A folder with this name already exists here" });

    const { data, error } = await supabase.from("folders")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id).select().single();

    if (error) return res.status(400).json({ message: error.message });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* MOVE FOLDER */
const moveFolder = async (req, res) => {
  try {
    const { id }      = req.params;
    const { parent_id } = req.body;
    const targetParentId = (parent_id && parent_id !== 'root') ? parent_id : null;

    if (targetParentId === id) return res.status(400).json({ message: "Cannot move folder into itself" });

    const { data: folder } = await supabase.from("folders").select("*")
      .eq("id", id).eq("owner_id", req.user.id).eq("is_deleted", false).single();
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    if (targetParentId) {
      const { data: parent } = await supabase.from("folders").select("id")
        .eq("id", targetParentId).eq("owner_id", req.user.id).eq("is_deleted", false).single();
      if (!parent) return res.status(404).json({ message: "Target folder not found" });

      if (await checkIsDescendant(id, targetParentId)) {
        return res.status(400).json({ message: "Cannot move a folder into its own subfolder" });
      }
    }

    const { data, error } = await supabase.from("folders")
      .update({ parent_id: targetParentId, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();

    if (error) return res.status(400).json({ message: error.message });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* DELETE FOLDER (Soft) */
const deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: folder } = await supabase.from("folders").select("id")
      .eq("id", id).eq("owner_id", userId).eq("is_deleted", false).single();
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    const now = new Date().toISOString();

    // 1. Mark main folder as deleted
    await supabase.from("folders")
      .update({ is_deleted: true, deleted_at: now }).eq("id", id);

    // 2. Mark files inside as deleted
    await supabase.from("files")
      .update({ is_deleted: true, deleted_at: now })
      .eq("folder_id", id).eq("owner_id", userId);

    // 3. Mark immediate subfolders as deleted
    await supabase.from("folders")
      .update({ is_deleted: true, deleted_at: now })
      .eq("parent_id", id).eq("owner_id", userId);

    res.json({ message: "Folder moved to trash" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

async function checkIsDescendant(folderId, targetId) {
  let currentId = targetId;
  const visited = new Set();
  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    if (currentId === folderId) return true;
    const { data } = await supabase.from("folders").select("parent_id").eq("id", currentId).single();
    currentId = data?.parent_id;
  }
  return false;
}

module.exports = { createFolder, getFolders, renameFolder, moveFolder, deleteFolder };