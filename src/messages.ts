import { Type } from 'class-transformer';
import { PairingQR } from './krpairing';

//  Defines communication between extension background page and popup
//  Request: Popup -> Background
//  Response: Background -> Popup

export enum RequestType {
    unpair = 'unpair',
    getState = 'getState',
    refreshPopup = 'refreshPopup',
}

export class Message {

    public static newRequest(r: Request): Message {
        const m = new Message();
        m.request = r;
        return m;
    }

    public static newResponse(r: Response): Message {
        const m = new Message();
        m.response = r;
        return m;
    }

    public static newToast(t: Toast): Message {
        const m = new Message();
        m.toast = t;
        return m;
    }
    @Type(() => Request)
    public request?: Request;
    @Type(() => Response)
    public response?: Response;
    @Type(() => Toast)
    public toast?: Toast;
}

export class Request {
    public ty: RequestType;
    constructor(t: RequestType) {
        this.ty = t;
    }
}

export class Response {
    public paired: boolean;
    public phoneName?: string;
    @Type(() => PairingQR)
    public qr?: PairingQR;
    public u2fAccounts?: string[];
}

export class Toast {
    public error?: string;
    public success?: string;
    public pending?: string;
}
