// @ts-nocheck

declare namespace Express {
  export interface Request {
    params: { gameId: string };
    cwMetricName: string;
  }
  export interface Response {
    [x: string]: any;
  }
}

interface StripeDate extends String {}
interface Email extends String {}
