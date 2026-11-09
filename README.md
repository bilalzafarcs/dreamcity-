# Cloud City 🏔️✨

An interactive 3D virtual town built with **Three.js**, procedural generation, and American mountain valley aesthetics. Every follower gets their own house in an expanding town!

---

## 🚀 Quick Start

1. Start the local server:
   ```bash
   python -m http.server 3000
   ```
   *or if using npm:*
   ```bash
   npm start
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## 🌟 Key Features

- **Procedural Alpine Valley**: Dynamic 3D mountains, pine forests, roads, rivers, and bridges built with vertex-colored geometry buffers for high performance.
- **Iconic Mountain Sign**: Massive Hollywood-style white letters on the mountain slope automatically generating `CLOUD CITY` (supports any text A-Z).
- **Follower Housing System**:
  - Automatically arranges plots along streets radiating from the town center.
  - Houses upgrade across tiers: **House** ➔ **Chalet** ➔ **Lodge**.
  - Custom lot requests & architecture: castles, mansions, farms, skyscrapers, pizza places, donuts, spaceships, and more.
- **Drive Mode**:
  - Choose between **SUV**, **Sports Car**, or **Everyday Hatchback**.
  - Real steering, acceleration, braking, collision grid, and headlight beams.
- **Mayor Walking Mode**:
  - Explore the town in third-person as the Mayor (WASD / Arrow keys, Shift to run, drag to look around, or on-screen joystick).
- **Interactive House Interiors**:
  - Step inside houses with detailed 3D rooms (kitchen, study, bedroom, freestanding tub, mountain terrace, and Councillor Whiskers the cat).
- **Front Line Defense**:
  - Outer perimeter defense base with tanks, sandbag walls, watchtowers, and animated troops holding off zombie raids.
- **Atmospheric Day/Night & Weather**:
  - Real-time or manual clock controls (day, sunset, dusk, night).
  - Dynamic weather toggles (sunny, mist, overcast, rain).
- **Generative Audio Synthesizer**:
  - Ambient melodic alpine bells generated purely in real-time code via the Web Audio API without needing external MP3 files.
- **Story Sharing & Search**:
  - Search residents by nickname or address.
  - Generate and download custom social story cards for any house.

---

## 🛠️ How to Customize

All town settings and the resident list are defined in [`residents.js`](./residents.js):

```javascript
window.TOWN = {
  name: 'Cloud City',                // Town name (reflected on signs, mountain, scoreboard, etc.)
  handle: '@cloudcity',              // Social handle
  elevation: '3,950 ft',              // Displayed altitude
  plots: 10000,                      // Total plot layout capacity
  levels: [['House', 0], ['Chalet', 3], ['Lodge', 10]],
  buildOptions: ['Ski lift', 'Diner', 'Movie theater', 'Bakery'],
  mall: { name: 'Cloud Mall', steps: [100, 200, 300, 400, 500] }
};
```

### Adding New Residents
To add followers to the town, append their nickname to the `REAL` array in [`residents.js`](./residents.js):
```javascript
'new_follower_handle',
{ n: 'special_follower', wish: 'castle' }
```

Available special wishes include: `castle`, `mansion`, `skyscraper`, `spaceship`, `donut`, `chicken`, `pizza`, `tree`, `corner`, `river`, `farm`, `gym`, `goldmansion`, `lighthouse`, `pyramid`, and more!

---

## 🔐 Managing Residents from a Secure URL & Admin Dashboard

You can manage all residents remotely and securely through an external API endpoint and the built-in **Resident Manager** dashboard.

### 1. Launch the Resident Manager Dashboard
Open [`admin.html`](./admin.html) in your browser:
```
http://localhost:3000/admin.html
```

From this dashboard, you can:
- 🔐 Connect using your **Secure API URL** and **Admin Secret Token** (using Bearer authentication).
- 🔍 Search and filter through all residents in real-time.
- ➕ **Add Residents**: assign house tiers (House, Chalet, Lodge), aliases (TikTok/Instagram handles), and custom architecture wishes (Castles, Mansions, Donuts, Spaceships, etc.).
- ✏️ **Edit & Delete**: update tiers, wishes, or remove residents.
- ⚙️ **Dynamic Claim Settings**: customize the "Claim it on Instagram" button text, target link, plot instructions, or toggle the button on/off.
- 📦 **Seed / Bulk Sync**: upload all bundled residents to your remote database in one click.
- 📤 **Export**: download the full resident database to JSON anytime.

### 2. Connect Cloud City Frontend to your Secure API
Cloud City can automatically load residents dynamically from your secure endpoint at startup. You can specify the API URL in any of the following ways:

1. **Via Admin Dashboard**: Connect once in `admin.html`; it automatically saves the API URL for Cloud City.
2. **Via URL Parameter**:
   ```
   http://localhost:3000/?api=https://your-api.com
   ```
3. **In [`residents.js`](./residents.js)**:
   ```javascript
   window.TOWN = {
     ...
     apiUrl: 'https://your-api.com',
     ...
   };
   ```

*Note: If the remote API is offline or slow, Cloud City automatically and gracefully falls back to the local bundled `residents.js` list.*

### 3. API Specification for External Backends
If you are connecting Cloud City and the Resident Manager to an external backend or custom microservice, ensure it implements these REST endpoints:

- `GET /api/residents` — Returns `[{ n: "the_mayor", lvl: 3 }, { n: "alice", wish: "castle" }, ...]`
- `POST /api/residents` — Create resident. Headers: `Authorization: Bearer <ADMIN_TOKEN>`
- `PUT /api/residents/:nick` — Update resident. Headers: `Authorization: Bearer <ADMIN_TOKEN>`
- `DELETE /api/residents/:nick` — Remove resident. Headers: `Authorization: Bearer <ADMIN_TOKEN>`
- `POST /api/residents/sync` — Bulk upload. Body: `{ "residents": [...] }`. Headers: `Authorization: Bearer <ADMIN_TOKEN>`

A ready-to-run zero-dependency Node.js reference server with Bearer auth and disk persistence is provided in [`server.js`](./server.js).
Run it with:
```bash
ADMIN_TOKEN=your_secret_token node server.js
```
