
import fs from 'fs';
import path from 'path';

export const storeLog = (input) => {
    const logPath = path.join(process.cwd(), 'storage', 'backend.log');
    const logData = `[${new Date().toISOString()}] ${JSON.stringify(input)}\n|------------------------\n`;
    
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, logData);

    return true;
}


