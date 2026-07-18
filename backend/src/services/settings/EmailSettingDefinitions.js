const definitions = [
 ["email.enabled","boolean",false,"EMAIL_ENABLED"],["email.provider","enum","smtp","EMAIL_PROVIDER",["smtp"]],
 ["email.smtp.host","host","","SMTP_HOST"],["email.smtp.port","port",587,"SMTP_PORT"],["email.smtp.secure","boolean",false,"SMTP_SECURE"],["email.smtp.requireTLS","boolean",true,"SMTP_REQUIRE_TLS"],
 ["email.smtp.username","string","","SMTP_USER"],["email.smtp.password","secret",undefined,"SMTP_PASS",null,true],
 ["email.fromName","string","Parentheses Solutions",""],["email.fromEmail","email","no-reply@example.com","SMTP_FROM"],["email.replyTo","email","support@example.com","SMTP_REPLY_TO"],
 ["email.connectionTimeout","duration",15000,"EMAIL_TIMEOUT_MS"],["email.greetingTimeout","duration",15000,"EMAIL_TIMEOUT_MS"],["email.socketTimeout","duration",15000,"EMAIL_TIMEOUT_MS"],
 ["email.retryCount","number",2,"EMAIL_RETRY_COUNT"],["email.rateLimit","number",60,""],["email.maximumDaily","number",10000,""],["email.encoding","enum","utf-8","",["utf-8","ascii"]],
];
function registerEmailSettings(registry){for(const [key,type,value,envKey,options,encrypted] of definitions){if(!registry.has(key))registry.register({key,label:key.split(".").pop(),group:"email",type,default:value,envKey,options,encrypted:Boolean(encrypted),visible:!encrypted,required:!["email.replyTo","email.smtp.password"].includes(key),description:`Runtime ${key} setting.`});}return registry;}
module.exports={definitions,registerEmailSettings};
