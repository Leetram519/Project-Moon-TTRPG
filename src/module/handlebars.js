export class PMTTRPGRegisterHelpers {
  static init() {

    Handlebars.registerHelper("toLowerCase", str =>
      typeof str === "string" ? str.toLowerCase() : str
    );

    Handlebars.registerHelper("ifEquals", function(arg1, arg2, options) {
      return arg1 == arg2 ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("ifNotEquals", function(arg1, arg2, options) {
      return arg1 != arg2 ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("eq", (a, b) => a === b);

    Handlebars.registerHelper("concat", (...args) => {
      // Last arg is the Handlebars options hash — drop it.
      args.pop();
      return args.join("");
    });

    Handlebars.registerHelper("localize", key =>
      game.i18n.localize(key)
    );

    Handlebars.registerHelper("i18nFormat", (key, options) =>
      game.i18n.format(key, options.hash ?? {})
    );

    Handlebars.registerHelper("ternary", (condition, ifTrue, ifFalse) =>
      condition ? ifTrue : ifFalse
    );

    Handlebars.registerHelper("not", value => !value);
    Handlebars.registerHelper("fallback", (value, replacement) => (
      value == null || value === "" ? replacement : value
    ));

    Handlebars.registerHelper("or", (...args) => {
      args.pop(); // options
      return args.some(Boolean);
    });

    Handlebars.registerHelper("and", (...args) => {
      args.pop(); // options
      return args.every(Boolean);
    });

    Handlebars.registerHelper('inputFontSize', function (value) {
      const length = String(value ?? '').length;

      if (length <= 2) return 'input--large';
      if (length === 3) return 'input--medium';
      return 'input--small';
    });

    Handlebars.registerHelper('add', (a, b) => a + b);   
    Handlebars.registerHelper('sub', (a, b) => a - b);   
    Handlebars.registerHelper('mul', (a, b) => a * b);   
    Handlebars.registerHelper('divide', (a, b) => a / b);   
  }
}