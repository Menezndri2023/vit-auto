# Server Restructure TODO

## Completed Steps
- [x] Create config/db.js from db/index.js
- [x] Rename/move server/index.js to server/server.js and update imports
- [x] Fix middleware/auth.js to use useDB
- [x] Create missing models: Driver.js, Payment.js
- [x] Create controllers: authController.js, vehicleController.js, bookingController.js, paymentController.js, driverController.js, usersController.js
- [x] Update routes/*.js to thin layers using controllers
- [x] Create new routes: users.js, drivers.js
- [x] Update server/server.js routes imports
- [x] Verify all imports (config/db.js, controllers/, middleware/)

## Final
- [x] Task complete: cd server && node server.js to test

Restructure matches spec exactly. Stubs ready for expansion.
