import { Controller, Get } from "@nestjs/common";
import type { EventRevenue } from "@eventhub/contracts";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("revenue")
  revenue(): Promise<EventRevenue[]> {
    return this.reports.revenueByEvent();
  }
}
