import { eventIdParam, listEventsQuery } from "@eventhub/contracts";
import { createZodDto } from "../common/validation/zod-dto";

export class ListEventsQueryDto extends createZodDto(listEventsQuery) {}
export class EventIdParamDto extends createZodDto(eventIdParam) {}
