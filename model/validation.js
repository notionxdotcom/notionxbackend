import Joi from "joi"
const validation_schema=Joi.object({
 password:Joi.string().pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&]).{8,}$')).messages({"string.pattern.base": "Password must be at least 8 chars, include uppercase, lowercase, number, and special character"}),
 phoneNumber:Joi.string().max(11).required(),
referralCode:Joi.string().max(8).allow(null, ''),

});
export default validation_schema;