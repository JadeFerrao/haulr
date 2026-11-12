# Haulr – Live Network & Airport Operations (Next.js)

A high-performance 3D interactive logistics and airport operations dashboard converted into a clean Next.js (App Router) project with TypeScript and Three.js.

## Modes

Use the top-center floating segmented toggle to switch between:
1. **Logistics**: The original real-time logistics network with distribution warehouses, automated container docks, container ships, delivery trucks, delivery drones, and conveyor systems.
2. **Airport**: A massive, detailed 3D international airport hub with:
   - **Runway & Taxiways**: Active Runway 09L/27R with white threshold piano keys, touchdown zone markers, sequential approach lighting strobe towers, and parallel taxiways with yellow centerlines.
   - **Terminal & Gates**: Modern curved glass terminal with Concourses A & B, multi-bay jet bridges (aerobridges) docked to aircraft.
   - **Air Traffic Control (ATC) Tower**: High-rise control tower with glass observation cab, rotating surveillance radar, and flashing green/white beacon.
   - **Airplanes**:
     - **Landing airliner (AF-402)**: Glides down the approach path, touches down on runway, rolls out, and vacates onto the taxiway.
     - **Takeoff airliner (EK-204)**: Lines up at threshold, accelerates down the runway, rotates nose up, and climbs steeply away into the clouds.
     - **Overhead cruise airliner (UA-920)**: High-altitude orbit with flashing wingtip navigation strobes.
     - **Parked airliners**: Docked at terminal gates with jet bridges aligned with passenger doors.
   - **Ground Service Equipment (GSE)**:
     - Pushback tugs with towbars
     - Aviation Jet-A1 fuel tanker trucks
     - Passenger boarding mobile stairs / ladder trucks
     - Baggage tractors hauling 3-cart luggage trains
     - Low-floor airport passenger tarmac transfer buses
     - Catering trucks with scissor-lift box bodies
     - Runway safety "Follow Me" inspection cars with rooftop flashing amber lightbars
   - **Landside Access**:
     - Terminal entrance roadway with circulating yellow city taxis
     - Landside parking lot filled with rows of parked cars
     - Landscaped gardens, plazas, and perimeter tree belts

## Structure

```text
haulr/
├── src/
│   ├── app/
│   │   ├── globals.css            # Styles, CSS variables (dark/light), toggle, animations
│   │   ├── layout.tsx             # Root layout with HTML/meta/font setup
│   │   └── page.tsx               # Main page combining NetworkView and Dashboard
│   ├── components/
│   │   ├── NetworkView.tsx        # 3D Three.js canvas, top toggle, zoom & camera controls
│   │   ├── ShipmentList.tsx       # Live collapsible sidebar for shipments or flights/GSE
│   │   ├── Dashboard.tsx          # Network performance overview section
│   │   └── DashboardCards.tsx     # Dynamic 2D canvas charts (Logistics vs Airport)
│   └── lib/
│       ├── threeHelpers.ts        # Three.js geometry helpers, materials, math, and paths
│       ├── scene.ts               # Logistics 3D world generator & simulation
│       ├── frameLoop.ts           # Logistics 60fps tick loop
│       ├── airportScene.ts        # Airport 3D world generator (airliners, GSE, terminal)
│       ├── airportFrameLoop.ts    # Airport 60fps flight paths & vehicle patrol loops
│       └── charts.ts              # Canvas chart rendering utilities (bars, lines, gauges)
├── public/
├── package.json
├── tsconfig.json
└── next.config.mjs
```

## Getting Started

1. Navigate to the project directory:
   ```bash
   cd haulr
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.
