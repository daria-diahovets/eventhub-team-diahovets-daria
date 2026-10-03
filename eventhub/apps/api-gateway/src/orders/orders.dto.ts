import { cancelOrderBody, createOrderBody, orderIdParam } from "@eventhub/contracts";
import { createZodDto } from "../common/validation/zod-dto";

export class CreateOrderBodyDto extends createZodDto(createOrderBody) {}
export class OrderIdParamDto extends createZodDto(orderIdParam) {}
export class CancelOrderBodyDto extends createZodDto(cancelOrderBody) {}
