const axios = require('axios');
async function test() {
    try {
        const res = await axios.post('https://api.alphagoldx.com/api/authenticate/', {
            username: "09121234567"
        });
        console.log("Success:", res.data);
    } catch(e) {
        console.error("Error:", e.response?.data || e.message);
    }
}
test();
