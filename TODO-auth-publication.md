# TODO: Advanced Auth & Publication System

## Progress:
**Backend:**
- [x] User model: role enum ['client', 'partenaire']
- [x] Vehicle model: type ['location', 'vente', 'chauffeur'], new fields (caution, ageMin, kilometrage, etc.)
- [x] Driver model created.
- [x] authController: role from req.body.

**Frontend:**
- [x] Register.jsx: role dropdown.
- [x] Login.jsx: updated.

**Next:**
1. Rewrite src/pages/VendorSubmit.jsx → dynamic form 3 types (Vente/Location/Chauffeur) with conditional fields.
2. Add client verification page.
3. Booking checks (role, docs).
4. Backend controllers/routes for new fields/upload.

Dev server running. Backend restart needed for model changes (`cd server && node server.js`).
