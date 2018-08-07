export enum RequestTypes {
    GET_API_VERSION = 'u2f_get_api_version_request',
    REGISTER_U2F = 'u2f_register_request',
    REGISTER_WEBAUTHN = 'webauthn_register_request',
    SIGN_U2F = 'u2f_sign_request',
    SIGN_WEBAUTHN = 'webauthn_sign_request',
}

export enum ResponseTypes {
    GET_API_VERSION = 'u2f_get_api_version_response',
    REGISTER_U2F = 'u2f_register_response',
    REGISTER_WEBAUTHN = 'webauthn_register_response',
    SIGN_U2F = 'u2f_sign_response',
    SIGN_WEBAUTHN = 'webauthn_sign_response',
}
