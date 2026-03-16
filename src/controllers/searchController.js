//It's redundant - fileController already has searchFiles.
//Fixed it to be secure.

const supabase = require("../config/supabaseClient")

exports.search = async(req, res) => {
  try {
    const { q } = req.query

    if (!q || q.trim() === '') {
      return res.status(400).json({ 
        message: "Search query required" 
      })
    }

    // Filter by owner
    const { data, error } = await supabase
      .from("files")
      .select("*")
      .ilike("name", `%${q}%`)
      .eq("owner_id", req.user.id) //ADDED
      .eq("is_deleted", false) //ADDED

    if (error) {
      return res.status(400).json(error)
    }

    res.json(data)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}