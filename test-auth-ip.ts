import axios from 'axios';
async function test() {
    try {
        const res = await axios.post('https://api.alphagoldx.com/api/authenticate/', {
            username: "09233121500"
        }, {
            headers: {
                'X-Forwarded-For': '5.213.200.200',
                'X-Real-IP': '5.213.200.200',
                'Client-IP': '5.213.200.200',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://alphagoldx.com',
                'Referer': 'https://alphagoldx.com/'
            }
        });
        console.log("Success:", res.data);
    } catch(e) {
        console.error("Error:", e.response?.data || e.message);
    }
}
test();
