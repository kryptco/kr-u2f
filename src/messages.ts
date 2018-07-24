import { PairingQR } from "./krpairing";
import { Type } from "class-transformer";

//  Defines communication between extension background page and popup
//  Request: Popup -> Background
//  Response: Background -> Popup

export enum RequestType {
    unpair = 'unpair',
    getState = 'getState',
    refreshPopup = 'refreshPopup',
}

export class Message {
    @Type(() => Request)
    request?: Request;
    @Type(() => Response)
    response?: Response;
    @Type(() => Toast)
    toast?: Toast;

    static newRequest(r: Request) : Message {
        let m = new Message();
        m.request = r;
        return m;
    }

    static newResponse(r: Response) : Message {
        let m = new Message();
        m.response = r;
        return m;
    }

    static newToast(t: Toast) : Message {
        let m = new Message();
        m.toast = t;
        return m;
    }
}

export class Request {
    ty: RequestType;
    constructor(t: RequestType) {
        this.ty = t;
    }
};

export class Response {
    paired: boolean;
    phoneName?: string;
    @Type(() => PairingQR)
    qr?: PairingQR;
    u2fAccounts?: Array<string>;
};

export class Toast {
    error?: string;
    success?: string;
    pending?: string;
}