import { Type, Transform } from "class-transformer";
import { VERSION } from "./krpairing";
import { to_base64, from_base64, randombytes_buf } from "./crypto";

export class Request {
    request_id: string;
    v: string;
    unix_seconds: Number;
    a?: boolean;

    private constructor() {}

    static async make() {
        let r = new Request();
        r.v = VERSION;
        r.request_id = await to_base64(await randombytes_buf(32));
        r.unix_seconds = Math.round(Date.now() / 1000);
        r.a = false;
        return r;
    }

    @Type(() => MeRequest)
    me_request?: MeRequest;
    @Type(() => UnpairRequest)
    unpair_request?: UnpairRequest;
    @Type(() => U2FRegisterRequest)
    u2f_register_request?: U2FRegisterRequest;
    @Type(() => U2FAuthenticateRequest)
    u2f_authenticate_request?: U2FRegisterRequest;
}

export class MeRequest {
    u2f_only?: boolean;
}

export class UnpairRequest {}

export class U2FRegisterRequest {
    challenge: Uint8Array;
    app_id: string;
}

export class U2FRegisterResponse {
	@Transform(v => from_base64(v))
    public_key: Uint8Array;
    counter: number;
	@Transform(v => from_base64(v))
    signature: Uint8Array;
	@Transform(v => from_base64(v))
    attestation_certificate: Uint8Array;
	@Transform(v => from_base64(v))
    key_handle: Uint8Array;
}

export const KRYPTON_U2F_MAGIC = new Uint8Array([
    0x2c, 0xe5, 0xc8, 0xdf, 0x17, 0xe2, 0x2e, 0xf2, 
    0x0f, 0xd3, 0x83, 0x03, 0xfd, 0x2d, 0x99, 0x98, 
]);

export class U2FAuthenticateRequest {
    challenge: Uint8Array;
    app_id: string;
    key_handle: Uint8Array;
}

export class U2FAuthenticateResponse {
    counter: number;
	@Transform(v => from_base64(v))
    signature: Uint8Array;
	@Transform(v => from_base64(v))
    public_key: Uint8Array;
}

export class Response {
    request_id: string;
    v: string;

    sns_endpoint_arn?: string;
    tracking_id?: string;
    
    @Type(() => AckResponse)
    ack_response?: AckResponse;
    @Type(() => MeResponse)
    me_response?: MeResponse;
    @Type(() => UnpairResponse)
    unpair_response?: UnpairResponse;
    @Type(() => U2FRegisterResponse)
    u2f_register_response?: U2FRegisterResponse;
    @Type(() => U2FAuthenticateResponse)
    u2f_authenticate_response?: U2FAuthenticateResponse;
}

export class MeResponse {
    @Type(() => Me)
    me: Me;
}

export class Me {
    //  omit pgp/ssh public keys
	@Transform(v => v && from_base64(v))
    device_identifier?: Uint8Array;
    email: string;
    u2f_accounts?: Array<string>;
}

export class UnpairResponse {}
export class AckResponse {}