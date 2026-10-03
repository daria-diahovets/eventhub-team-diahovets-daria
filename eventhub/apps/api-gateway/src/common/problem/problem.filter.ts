import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch } from "@nestjs/common";
import type { PinoLogger } from "nestjs-pino";
import { InjectPinoLogger } from "nestjs-pino";
import { toProblem } from "./problem";

interface HttpRequestLike {
  url: string;
  originalUrl: string;
}

interface HttpResponseLike {
  status(code: number): this;
  type(contentType: string): this;
  json(body: unknown): void;
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(ProblemFilter.name) private readonly logger: PinoLogger,
  ) {}

  catch(err: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<HttpRequestLike>();
    const problem = toProblem(err);

    if (problem.status >= 500) {
      this.logger.error({ err, url: req.url }, "unhandled error");
    } else {
      this.logger.debug({ type: problem.type, url: req.url }, "request rejected");
    }

    ctx
      .getResponse<HttpResponseLike>()
      .status(problem.status)
      .type("application/problem+json")
      .json({ ...problem, instance: req.originalUrl });
  }
}
