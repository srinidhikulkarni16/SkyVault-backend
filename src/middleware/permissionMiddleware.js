const supabase = require("../config/supabaseClient");


/**
 * Checks if the user has permission to access or modify a resource.
 * @param {string} resourceType - 'file' or 'folder'
 * @param {string} requiredRole - 'owner', 'editor', or 'viewer'
 */


module.exports = (resourceType, requiredRole = 'owner') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id || req.body.resourceId;
      const userId = req.user.id;
      const table = resourceType === 'file' ? 'files' : 'folders';

      // 1. Check Ownership
      const { data: resource } = await supabase
        .from(table)
        .select("owner_id")
        .eq("id", resourceId)
        .single();

      if (!resource) return res.status(404).json({ message: "Resource not found" });
      if (resource.owner_id === userId) return next();

      // 2. Check Shared Permissions if not the owner
      if (requiredRole !== 'owner') {
        const { data: share } = await supabase
          .from("shares")
          .select("role")
          .eq("resource_type", resourceType)
          .eq("resource_id", resourceId)
          .eq("grantee_user_id", userId)
          .single();

        if (share) {
          const hasAccess = (requiredRole === 'viewer') || 
                            (requiredRole === 'editor' && share.role === 'editor');
          if (hasAccess) return next();
        }
      }

      return res.status(403).json({ message: "Access denied: Insufficient permissions" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
};