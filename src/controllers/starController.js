const supabase = require("../config/supabaseClient");

exports.starItem = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.body;
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