import { healthPayload } from '../lib/feed.mjs';

export default function handler(_request, response) {
  response.status(200).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(healthPayload()));
}
