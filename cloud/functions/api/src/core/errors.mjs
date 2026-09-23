/** 业务错误：路由层统一转成 HTTP 状态码，不把栈信息泄给客户端。 */

export class BadRequest extends Error {
  constructor(message, field) {
    super(message);
    this.name = "BadRequest";
    this.field = field;
    this.statusCode = 400;
    this.code = "INVALID_PARAM";
    this.extra = { field };
  }
}

export class Unauthorized extends Error {
  constructor(message = "登录已失效，请重新登录") {
    super(message);
    this.name = "Unauthorized";
    this.statusCode = 401;
    this.code = "UNAUTHORIZED";
  }
}

export class Conflict extends Error {
  constructor(message, extra) {
    super(message);
    this.name = "Conflict";
    this.statusCode = 409;
    this.code = "CONFLICT";
    this.extra = extra || {};
  }
}

export class Forbidden extends Error {
  constructor(message = "该操作已被关闭") {
    super(message);
    this.name = "Forbidden";
    this.statusCode = 403;
    this.code = "FORBIDDEN";
  }
}
