import { loginBody, registerBody } from "@eventhub/contracts";
import { createZodDto } from "../common/validation/zod-dto";

export class RegisterBodyDto extends createZodDto(registerBody) {}
export class LoginBodyDto extends createZodDto(loginBody) {}
