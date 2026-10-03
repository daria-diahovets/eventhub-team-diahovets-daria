import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import type { CreateOrderResponse, Order } from "@eventhub/contracts";
import { OrdersService } from "./orders.service";
import { CancelOrderBodyDto, CreateOrderBodyDto, OrderIdParamDto } from "./orders.dto";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateOrderBodyDto): Promise<CreateOrderResponse> {
    return this.orders.create(body.eventId, body.quantity);
  }

  @Get(":orderId")
  getOne(@Param() params: OrderIdParamDto): Promise<Order> {
    return this.orders.getOne(params.orderId);
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
