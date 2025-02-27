import { SquareClient, SquareEnvironment } from 'square';
import dotenv from 'dotenv';

dotenv.config();

const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN;

if (!SQUARE_TOKEN) {
  console.error('Square access token is not defined');
  process.exit(1);
}

const squareClient = new SquareClient({
token: SQUARE_TOKEN,  // Changé de token à accessToken
  environment: SquareEnvironment.Production
});

console.log('Square Client initialized with token:', SQUARE_TOKEN.substring(0, 5) + '...');

export default squareClient;