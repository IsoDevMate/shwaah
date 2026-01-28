import { encrypt, decrypt } from './src/utils/crypto';
import dotenv from 'dotenv';
dotenv.config();

console.log('Testing crypto...');
try {
    const original = 'test-token';
    console.log('Original:', original);
    const encrypted = encrypt(original);
    console.log('Encrypted:', encrypted);
    const decrypted = decrypt(encrypted);
    console.log('Decrypted:', decrypted);
    if (original === decrypted) {
        console.log('SUCCESS: Crypto works.');
    } else {
        console.log('FAILURE: Decrypted does not match original.');
    }
} catch (e: any) {
    console.error('ERROR:', e.message);
}
