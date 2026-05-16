import Joi from "joi"
const validation_schema=Joi.object({
 password:Joi.string(),
 phoneNumber:Joi.string().max(11).required(),
referralCode:Joi.string().max(8).allow(null, ''),

});
export default validation_schema;