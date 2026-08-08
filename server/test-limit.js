const axios = require('axios');
async function test() {
  const waypoints = [];
  for (let i = 0; i < 25; i++) {
    waypoints.push({ lat: 28.6139 + (i * 0.01), lon: 77.2090, name: 'Point ' + i });
  }
  try {
    const res = await axios.post('https://anantyatra.codesagepath.dev/api/routes/calculate', {
      waypoints,
      costing: 'auto'
    });
    console.log("Success! Points:", waypoints.length);
  } catch (err) {
    console.log("Error:", err.response?.data || err.message);
  }
}
test();
