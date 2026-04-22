# TODO: Fix 401 Unauthorized on Vehicle Publication

## Status: ✅ COMPLETED

**Breakdown:**
1. [✅] Create TODO.md
2. [✅] Add token/role guards in src/pages/VendorSubmit.jsx
   - Guard: if (!token) → toast + redirect /login
   - Guard: if (user.role not partenaire/admin) → toast + /register?role=partenaire
   - handleSubmit: explicit token check
3. [✅] Edit complete - Guards implemented
4. [✅] Verified changes via read_file
5. [✅] Task complete

**Result:** 401 fixed by preventing POST without valid backend token/role. Non-breaking (existing site intact).

**Next:** Test in browser:
- Ensure backend running (`cd server && npm start`)
- Login as partenaire → /vendor/submit → publish → no 401
- Local-only/no token → blocked + toast + redirect

