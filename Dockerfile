FROM node:8-alpine as builder

ARG TAG=v1.8.1

RUN apk add --no-cache git python make

RUN mkdir /app

RUN mkdir /app/vendors

COPY ./ /app/vendors

RUN mv /app/vendors/config.json /app

RUN cd /app/vendors && sed -i -e 's|init\.lock|runtime/init.lock|g' server/install.js  \
    && npm install --production --registry https://registry.npm.taobao.org

FROM node:8-alpine

ENV TZ="Asia/Shanghai" HOME="/"

RUN apk add --no-cache tini

WORKDIR /app/vendors

# COPY --from=builder /app/vendors /app/vendors

# 复制执行脚本到容器的执行目录
COPY ./entrypoint.sh  /app/vendors/

EXPOSE 3000

ENTRYPOINT [ "/sbin/tini", "--" ]
CMD [ "/app/vendors/entrypoint.sh" ]
