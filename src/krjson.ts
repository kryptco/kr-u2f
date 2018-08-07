import {plainToClass} from 'class-transformer';
import { ClassType } from 'class-transformer/ClassTransformer';

export function stringify(o: any) {
    return JSON.stringify(o, (k, v) => {
        if (v && v.constructor === Uint8Array) {
            return Buffer.from(v).toString('base64');
        }
        return v;
    });
}

export function parse<T>(t: ClassType<T>, j: string ) {
    const parsed = JSON.parse(j, (k, v) => {
        return v;
    }) as T;
    return plainToClass(t, parsed);
}

//  Instead of re-writing all of the webauthn types, handle byte arrays manually
export function webauthnStringify(o: any) {
    return JSON.stringify(o, (k, v) => {
        if (v) {
            if (v.constructor.name === 'ArrayBuffer') {
                // Because Buffer.from(ArrayBuffer) was not working on firefox
                v = new Uint8Array(v);
            }
            if (v.constructor.name === 'Uint8Array') {
                return {
                    data: Buffer.from(v).toString('base64'),
                    kr_ser_ty: 'Uint8Array',
                };
            }
        }
        return v;
    });
}
export function webauthnParse(j: string) {
    return JSON.parse(j, (k, v) => {
        if (v && v.kr_ser_ty === 'Uint8Array') {
            return Uint8Array.from(Buffer.from(v.data, 'base64'));
        }
        if (v && v.kr_ser_ty === 'ArrayBuffer') {
            return Buffer.from(v.data, 'base64').buffer;
        }
        return v;
    });
}
