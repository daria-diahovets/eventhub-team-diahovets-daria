import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { RequestValidationFailed } from "../problem/domain-errors";
import type { ZodDtoClass } from "./zod-dto";

function hasZodSchema(metatype: unknown): metatype is ZodDtoClass {
  return typeof metatype === "function" && "zodSchema" in metatype;
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const dto = metadata.metatype;
    if (!hasZodSchema(dto)) return value;

    const result = dto.zodSchema.safeParse(value);
    if (result.success) return result.data;

    throw new RequestValidationFailed(
      result.error.issues.map((i) => ({
        field: i.path.join(".") || "(корінь)",
        code: i.code,
        message: i.message,
      })),
    );
  }
}
