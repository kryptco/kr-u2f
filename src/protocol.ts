import { Transform, Type } from 'class-transformer';
import { from_base64, randombytes_buf, to_base64 } from './crypto';
import { VERSION } from './krpairing';

export class Request {

    public static async make() {
        const r = new Request();
        r.v = VERSION;
        r.request_id = await to_base64(await randombytes_buf(32));
        r.unix_seconds = Math.round(Date.now() / 1000);
        r.a = false;
        return r;
    }
    public request_id: string;
    public v: string;
    public unix_seconds: Number;
    public a?: boolean;

    @Type(() => MeRequest)
    public me_request?: MeRequest;
    @Type(() => UnpairRequest)
    public unpair_request?: UnpairRequest;
    @Type(() => U2FRegisterRequest)
    public u2f_register_request?: U2FRegisterRequest;
    @Type(() => U2FAuthenticateRequest)
    public u2f_authenticate_request?: U2FAuthenticateRequest;

    private constructor() {}
}

export class MeRequest {
    public u2f_only?: boolean;
}

export class UnpairRequest {}

export class U2FRegisterRequest {
    public challenge: Uint8Array;
    public app_id: string;
}

export class U2FRegisterResponse {
    @Transform((v) => from_base64(v))
    public public_key: Uint8Array;
    public counter: number;
    @Transform((v) => from_base64(v))
    public signature: Uint8Array;
    @Transform((v) => from_base64(v))
    public attestation_certificate: Uint8Array;
    @Transform((v) => from_base64(v))
    public key_handle: Uint8Array;
    public error: string;
}

export const KRYPTON_U2F_MAGIC = new Uint8Array([
    0x2c, 0xe5, 0xc8, 0xdf, 0x17, 0xe2, 0x2e, 0xf2,
    0x0f, 0xd3, 0x83, 0x03, 0xfd, 0x2d, 0x99, 0x98,
]);

export class U2FAuthenticateRequest {
    public challenge: Uint8Array;
    public app_id: string;
    public key_handle: Uint8Array;
}

export class U2FAuthenticateResponse {
    public counter: number;
    @Transform((v) => from_base64(v))
    public signature: Uint8Array;
    @Transform((v) => from_base64(v))
    public public_key: Uint8Array;
    public error: string;
}

export class Response {
    public request_id: string;
    public v: string;

    public sns_endpoint_arn?: string;
    public tracking_id?: string;

    @Type(() => AckResponse)
    public ack_response?: AckResponse;
    @Type(() => MeResponse)
    public me_response?: MeResponse;
    @Type(() => UnpairResponse)
    public unpair_response?: UnpairResponse;
    @Type(() => U2FRegisterResponse)
    public u2f_register_response?: U2FRegisterResponse;
    @Type(() => U2FAuthenticateResponse)
    public u2f_authenticate_response?: U2FAuthenticateResponse;
}

export class MeResponse {
    @Type(() => Me)
    public me: Me;
}

export class Me {
    //  omit pgp/ssh public keys
    @Transform((v) => v && from_base64(v))
    public device_identifier?: Uint8Array;
    public email: string;
    public u2f_accounts?: string[];
}

export class UnpairResponse {}
export class AckResponse {}
