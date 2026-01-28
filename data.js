// data.js — sample dataset (Singapore) + constants

// Approx meter conversions
// 1 degree latitude ≈ 111,320 meters
// longitude varies with latitude; Singapore (~1.35°) => cos(lat) ~ 0.9997 so similar
export const METERS_PER_DEG_LAT = 111320;

// Map defaults
export const MAP_CENTER = [1.3521, 103.8198];
export const MAP_ZOOM = 12;

// Compliance buffer (school zones)
export const SCHOOL_BUFFER_M = 200;

// Thresholds for “density” color
export const DENSITY_THRESHOLDS = {
  green: 0.45,
  yellow: 0.75
};

// Sample: 12 existing smoking areas
export const EXISTING_AREAS = [
  { id:"D1", name:"Raffles Place Corner A", district:"CBD", lat:1.2830, lng:103.8515, capacity:40, occupancy:22 },
  { id:"D2", name:"Marina Bay Link Mall", district:"CBD", lat:1.2799, lng:103.8546, capacity:30, occupancy:24 },
  { id:"D3", name:"Tanjong Pagar Plaza", district:"CBD", lat:1.2766, lng:103.8458, capacity:35, occupancy:18 },

  { id:"E1", name:"Paya Lebar MRT Exit", district:"East", lat:1.3172, lng:103.8922, capacity:25, occupancy:20 },
  { id:"E2", name:"Bedok Central Alley", district:"East", lat:1.3240, lng:103.9304, capacity:20, occupancy:14 },
  { id:"E3", name:"Tampines Hub Side", district:"East", lat:1.3532, lng:103.9400, capacity:30, occupancy:12 },

  { id:"N1", name:"Bishan Junction 8", district:"North", lat:1.3507, lng:103.8488, capacity:25, occupancy:16 },
  { id:"N2", name:"Yishun Town Centre", district:"North", lat:1.4293, lng:103.8354, capacity:30, occupancy:26 },
  { id:"N3", name:"Woodlands MRT Walkway", district:"North", lat:1.4360, lng:103.7865, capacity:28, occupancy:19 },

  { id:"W1", name:"Jurong East Mall Link", district:"West", lat:1.3331, lng:103.7422, capacity:30, occupancy:21 },
  { id:"W2", name:"Clementi Central", district:"West", lat:1.3151, lng:103.7650, capacity:22, occupancy:17 },
  { id:"W3", name:"Bukit Batok Central", district:"West", lat:1.3490, lng:103.7491, capacity:24, occupancy:10 },
];

// Sample: 8 school zones
export const SCHOOL_ZONES = [
  { id:"S1", name:"School Zone: Cantonment", lat:1.2769, lng:103.8402 },
  { id:"S2", name:"School Zone: Tanjong Katong", lat:1.3033, lng:103.9030 },
  { id:"S3", name:"School Zone: Bedok", lat:1.3233, lng:103.9270 },
  { id:"S4", name:"School Zone: Tampines", lat:1.3560, lng:103.9530 },
  { id:"S5", name:"School Zone: Bishan", lat:1.3527, lng:103.8468 },
  { id:"S6", name:"School Zone: Yishun", lat:1.4310, lng:103.8380 },
  { id:"S7", name:"School Zone: Woodlands", lat:1.4410, lng:103.8010 },
  { id:"S8", name:"School Zone: Clementi", lat:1.3143, lng:103.7640 },
];

// Sample: 5 AQI sensors (problem areas)
export const AQI_SENSORS = [
  { id:"A1", name:"Sensor: CBD South", lat:1.2785, lng:103.8510, aqi:78 },
  { id:"A2", name:"Sensor: Paya Lebar", lat:1.3188, lng:103.8912, aqi:92 },
  { id:"A3", name:"Sensor: Bedok", lat:1.3236, lng:103.9320, aqi:88 },
  { id:"A4", name:"Sensor: Yishun", lat:1.4298, lng:103.8330, aqi:96 },
  { id:"A5", name:"Sensor: Jurong East", lat:1.3325, lng:103.7404, aqi:85 },
];

// Sample: 3 proposals (one approved, one under review)
export const PROPOSALS = [
  {
    id:"P1",
    name:"Proposed DSA: Marina South Link",
    district:"CBD",
    lat:1.2719, lng:103.8572,
    score:0.86,
    status:"Approved",
    rationale:[
      "High foot traffic corridor with limited DSA coverage.",
      "Moves smoke away from dense pedestrian crossings.",
      "Predicted occupancy relief for nearby sites (CBD)."
    ]
  },
  {
    id:"P2",
    name:"Proposed DSA: Tampines West Pocket",
    district:"East",
    lat:1.3512, lng:103.9355,
    score:0.79,
    status:"Under Review",
    rationale:[
      "Coverage gap near residential-commercial boundary.",
      "Moderate AQI hotspot; improve dispersion via placement."
    ]
  },
  {
    id:"P3",
    name:"Proposed DSA: Yishun North Walkway",
    district:"North",
    lat:1.4347, lng:103.8369,
    score:0.74,
    status:"Pending",
    rationale:[
      "Overcrowding detected at nearby centre.",
      "Relieves concentrated exposure near transport node."
    ]
  }
];
