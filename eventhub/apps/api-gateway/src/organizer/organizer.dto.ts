import { createEventBody, eventIdParam, updateEventBody } from "@eventhub/contracts";
import { createZodDto } from "../common/validation/zod-dto";

export class CreateEventBodyDto extends createZodDto(createEventBody) {}
export class UpdateEventBodyDto extends createZodDto(updateEventBody) {}
export class OrganizerEventIdParamDto extends createZodDto(eventIdParam) {}
