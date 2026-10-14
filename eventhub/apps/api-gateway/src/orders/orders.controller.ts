import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import type { CreateOrderResponse, Order } from "@eventhub/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { OrdersService } from "./orders.service";
import { CancelOrderBodyDto, CreateOrderBodyDto, OrderIdParamDto } from "./orders.dto";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateOrderBodyDto,
    @CurrentUser() current: AuthUser,
  ): Promise<CreateOrderResponse> {
    return this.orders.create(body.eventId, body.quantity, current.id);
  }

  @Get(":orderId")
  @UseGuards(JwtAuthGuard)
  getOne(
    @Param() params: OrderIdParamDto,
    @CurrentUser() current: AuthUser,
  ): Promise<Order> {
    return this.orders.getOne(params.orderId, current.id);
  }

  @Post(":orderId/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param() params: OrderIdParamDto,
    @Body() body: CancelOrderBodyDto,
  ): Promise<Order> {
    return this.orders.cancel(params.orderId, body.cancellationToken);
  }
}
