import axios from 'axios';
async function test() {
    try {
        const response = await axios.get('https://api.alphagoldx.com/api/authenticate/', { timeout: 5000 });
        console.log("Success:", response.status);
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
test();
