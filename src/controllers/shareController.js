const supabase = require("../config/supabaseClient");
const { v4: uuidv4 } = require("uuid");

exports.shareWithUser = async (req, res) => {
  try {
    const { resourceType, resourceId, granteeUserId, role } = req.body;

    const { data, error } = await supabase
      .from("shares")
      .insert([{
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_user_id: granteeUserId,
        role,
        created_by: req.user.id
      }])
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
    const { resourceType, resourceId } = req.body;
    const token = uuidv4();

    const { data, error } = await supabase
      .from("link_shares")
      .insert([{ resource_type: resourceType, resource_id: resourceId, token }])
      .select()
      .single();

    if (error) return res.status(400).json(error);
    res.json({ link: `${process.env.FRONTEND_URL}/share/${token}`, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};