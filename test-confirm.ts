import axios from 'axios';

// Set a browser-like User-Agent to prevent ArvanCloud/WAF from blocking requests
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
axios.defaults.headers.common['Accept'] = 'application/json, text/plain, */*';
axios.defaults.headers.common['Origin'] = 'https://alphagoldx.com';
axios.defaults.headers.common['Referer'] = 'https://alphagoldx.com/';

async function testConfirm(phone: string) {
    try {
        await axios.post(`https://api.alphagoldx.com/api/authenticate/`, {
            username: phone,
        });
        console.log("OTP Requested");

        const response = await axios.post(`https://api.alphagoldx.com/api/authenticate/comfirm/otp/`, {
            username: phone,
            code: "12345",
            ref: ""
        });
        console.log("Success:", response.data);
    } catch(e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}

testConfirm("09233121500");
