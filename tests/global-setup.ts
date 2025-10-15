import https from 'https';

async function globalSetup() {
  console.log('Global setup: Resetting server state...');

  return new Promise<void>((resolve, reject) => {
    const options = {
      hostname: 'auth.example.test',
      port: 443,
      path: '/dev/reset',
      method: 'POST',
      rejectUnauthorized: false, // Allow self-signed certificates
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode === 200 && json.success) {
            console.log('✓ Server state reset successfully');
            console.log(`  - OTP entries cleared: ${json.cleared.otpEntries}`);
            console.log(`  - Tokens cleared: ${json.cleared.tokens}`);
            resolve();
          } else {
            console.error('✗ Failed to reset server state:', json);
            reject(new Error('Server reset failed'));
          }
        } catch (error) {
          console.error('✗ Error parsing response:', error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('✗ Error resetting server state:', error);
      reject(error);
    });

    req.end();
  });
}

export default globalSetup;
