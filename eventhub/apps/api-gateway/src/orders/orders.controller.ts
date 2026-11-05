import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { idempotencyKey } from "@eventhub/contracts";
import type { Order } from "@eventhub/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { OrdersService } from "./orders.service";
import { CreateOrderBodyDto, OrderIdParamDto } from "./orders.dto";

@Controller("orders")
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  listMine(@CurrentUser() user: AuthUser): Promise<Order[]> {
    return this.orders.listMine(user.id);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateOrderBodyDto,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Order> {
    const parsed = idempotencyKey.safeParse(rawKey);
    const key = parsed.success ? parsed.data : undefined;

    const { order, replayed } = await this.orders.create(user, body, key);
    res.status(replayed ? 200 : 201);
    return order;
  }

  @Get(":orderId")
  getOne(@Param() params: OrderIdParamDto, @CurrentUser() user: AuthUser): Promise<Order> {
    return this.orders.getOne(params.orderId, user.id);
  }

  @Post(":orderId/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(@Param() params: OrderIdParamDto, @CurrentUser() user: AuthUser): Promise<Order> {
    return this.orders.cancel(params.orderId, user.id);
  }
}
