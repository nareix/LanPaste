//
//  Bridge.m
//  iosapp
//
//  Created by xb on 15-6-13.
//  Copyright (c) 2015年 Facebook. All rights reserved.
//


#import <UIKit/UIKit.h>
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>

#import "RCTBridge.h"
#import "RCTBridgeModule.h"
#import "RCTLog.h"
#import "RCTEventDispatcher.h"
#import "RCTViewManager.h"

#import <CFNetwork/CFNetwork.h>
#import <sys/socket.h>
#import <netinet/in.h>
#import <arpa/inet.h>
#import <sys/ioctl.h>
#import <net/if.h>
#import <netdb.h>

@interface NativeUIDevice : NSObject <RCTBridgeModule>
@end

@implementation NativeUIDevice

RCT_EXPORT_MODULE();

- (NSDictionary *)constantsToExport {
	UIDevice *dev = [UIDevice currentDevice];
	return @{ @"name": [dev name] };
}

@end

@interface NativePasteboard : NSObject <RCTBridgeModule>
@end

@implementation NativePasteboard

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(getContent:(RCTResponseSenderBlock)callback) {
	UIPasteboard *pboard = [UIPasteboard generalPasteboard];
	NSString *content = [pboard string];
	if (content == nil)
		content = @"";
	NSLog(@"Pasteboard: get %@", content);
	callback(@[content]);
}

RCT_EXPORT_METHOD(setContent:(NSString *)content) {
	UIPasteboard *pboard = [UIPasteboard generalPasteboard];
	NSLog(@"Pasteboard: set %@", content);
	pboard.string = content;
}

@end

static int convertToAddr(NSString *host, UInt16 port, NSData **address4, NSData **address6) {
	if (host == nil || ([host length] == 0))
	{
		// Use ANY address
		struct sockaddr_in nativeAddr;
		nativeAddr.sin_len         = sizeof(struct sockaddr_in);
		nativeAddr.sin_family      = AF_INET;
		nativeAddr.sin_port        = htons(port);
		nativeAddr.sin_addr.s_addr = htonl(INADDR_ANY);
		memset(&(nativeAddr.sin_zero), 0, sizeof(nativeAddr.sin_zero));
		
		struct sockaddr_in6 nativeAddr6;
		nativeAddr6.sin6_len       = sizeof(struct sockaddr_in6);
		nativeAddr6.sin6_family    = AF_INET6;
		nativeAddr6.sin6_port      = htons(port);
		nativeAddr6.sin6_flowinfo  = 0;
		nativeAddr6.sin6_addr      = in6addr_any;
		nativeAddr6.sin6_scope_id  = 0;
		
		// Wrap the native address structures for CFSocketSetAddress.
		if(address4) *address4 = [NSData dataWithBytes:&nativeAddr length:sizeof(nativeAddr)];
		if(address6) *address6 = [NSData dataWithBytes:&nativeAddr6 length:sizeof(nativeAddr6)];
		
		return 0;
	}
	else if([host isEqualToString:@"localhost"] || [host isEqualToString:@"loopback"])
	{
		// Note: getaddrinfo("localhost",...) fails on 10.5.3
		
		// Use LOOPBACK address
		struct sockaddr_in nativeAddr;
		nativeAddr.sin_len         = sizeof(struct sockaddr_in);
		nativeAddr.sin_family      = AF_INET;
		nativeAddr.sin_port        = htons(port);
		nativeAddr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
		memset(&(nativeAddr.sin_zero), 0, sizeof(nativeAddr.sin_zero));
		
		struct sockaddr_in6 nativeAddr6;
		nativeAddr6.sin6_len       = sizeof(struct sockaddr_in6);
		nativeAddr6.sin6_family    = AF_INET6;
		nativeAddr6.sin6_port      = htons(port);
		nativeAddr6.sin6_flowinfo  = 0;
		nativeAddr6.sin6_addr      = in6addr_loopback;
		nativeAddr6.sin6_scope_id  = 0;
		
		// Wrap the native address structures for CFSocketSetAddress.
		if(address4) *address4 = [NSData dataWithBytes:&nativeAddr length:sizeof(nativeAddr)];
		if(address6) *address6 = [NSData dataWithBytes:&nativeAddr6 length:sizeof(nativeAddr6)];
		
		return 0;
	}
	else
	{
		NSString *portStr = [NSString stringWithFormat:@"%hu", port];
		
		{
			struct addrinfo hints, *res, *res0;
			
			memset(&hints, 0, sizeof(hints));
			hints.ai_family   = PF_UNSPEC;
			hints.ai_socktype = SOCK_DGRAM;
			hints.ai_protocol = IPPROTO_UDP;
			hints.ai_flags    = AI_PASSIVE;
			
			int error = getaddrinfo([host UTF8String], [portStr UTF8String], &hints, &res0);
			
			if(error) return error;
			
			for(res = res0; res; res = res->ai_next)
			{
				if(address4 && !*address4 && (res->ai_family == AF_INET))
				{
					// Found IPv4 address
					// Wrap the native address structures for CFSocketSetAddress.
					if(address4) *address4 = [NSData dataWithBytes:res->ai_addr length:res->ai_addrlen];
				}
				else if(address6 && !*address6 && (res->ai_family == AF_INET6))
				{
					// Found IPv6 address
					// Wrap the native address structures for CFSocketSetAddress.
					if(address6) *address6 = [NSData dataWithBytes:res->ai_addr length:res->ai_addrlen];
				}
			}
			freeaddrinfo(res0);
		}
		
		return 0;
	}
}

@interface Socket : NSObject {
@public
	CFSocketRef socket;
	CFSocketContext context;
	void (^onEvent)(NSString *type, NSString *data);
	void (^onClose)();
}
@end

@implementation Socket

- (void)close {
	if (socket) {
		CFSocketInvalidate(socket);
		CFRelease(socket);
		socket = NULL;
	}
}

- (void)dealloc {
	NSLog(@"NativeSocket: dealloc");
	[self close];
}

@end

typedef void (^OnRefreshCb)();
static OnRefreshCb onRefreshCb;
static void addOnRefreshCb(OnRefreshCb cb) {
	OnRefreshCb oldCb = onRefreshCb;
	onRefreshCb = ^(){
		cb();
		if (oldCb)
			oldCb();
	};
}

@interface RefreshObserver : NSObject <RCTBridgeModule>
@end

@implementation RefreshObserver
RCT_EXPORT_MODULE();
- (void)dealloc {
	onRefreshCb();
}
@end

@interface NativeNetwork : NSObject <RCTBridgeModule> {
@public
	NSMutableDictionary *mSockets;
}
@end

@implementation NativeNetwork

RCT_EXPORT_MODULE();

@synthesize bridge = _bridge;

static void MyCFSocketCallback(CFSocketRef sref, CFSocketCallBackType type, CFDataRef address, const void *pData, void *pInfo)
{
	NSLog(@"onData type=%lu", type);
	
	@autoreleasepool {
		Socket *socket = (__bridge Socket *)pInfo;

		if (type == kCFSocketReadCallBack) {
			uint8_t buf[4096];
			struct sockaddr_in sockaddr4;
			socklen_t sockaddr4len = sizeof(sockaddr4);
			CFSocketNativeHandle sock = CFSocketGetNative(sref);

			int len = recvfrom(sock, buf, sizeof(buf)-1, 0, (struct sockaddr *)&sockaddr4, &sockaddr4len);
			NSLog(@"onData len=%d", len);
			
			if (len >= 0) {
				buf[len] = 0;
				NSLog(@"recv %s", buf);
				NSString *str = [NSString stringWithUTF8String:(const char *)buf];
				socket->onEvent(@"recv", str);
			} else {
				NSLog(@"NativeSocket: closed len=%d", len);
				[socket close];
				NSLog(@"NativeSocket: delete key");
				socket->onClose();
				NSLog(@"NativeSocket: emit close event");
				socket->onEvent(@"close", @"");
			}
		}
	}
}

- (id)init {
	self = [super init];
	if (self) {
		mSockets = [[NSMutableDictionary alloc] initWithDictionary:@{}];
		addOnRefreshCb(^{
			[mSockets removeAllObjects];
		});
	}
	return self;
}

RCT_EXPORT_METHOD(sendto:(NSString *)uuid host:(NSString *)host port:(int)port data:(NSString *)data) {
	Socket *socket = (Socket *)[mSockets valueForKey:uuid];
	if (socket == nil)
		return;
	
	NSData *nsdata = [data dataUsingEncoding:NSUTF8StringEncoding];
	NSData *addr = nil;
	convertToAddr(host, port, &addr, nil);
	sendto(CFSocketGetNative(socket->socket),
				 [nsdata bytes], [nsdata length], 0,
				 [addr bytes], (socklen_t)[addr length]);
	NSLog(@"NativeSocket: sendto %@:%d %d bytes", host, port, [nsdata length]);
}

RCT_EXPORT_METHOD(bind:(NSString *)uuid host:(NSString *)host port:(int)port) {
	Socket *socket = (Socket *)[mSockets valueForKey:uuid];
	if (socket == nil)
		return;

	NSData *addr = nil;
	convertToAddr(host, port, &addr, nil);
	CFSocketError error = CFSocketSetAddress(socket->socket, (__bridge CFDataRef)addr);
	if (error != kCFSocketSuccess) {
		NSLog(@"bindError");
	}
};

RCT_EXPORT_METHOD(create:(NSString *)uuid type:(NSString *)type) {
	Socket *socket = [[Socket alloc] init];

	NSLog(@"NativeSocket: create uuid=%@ type=%@ socket=%p", uuid, type, socket);

	[mSockets setValue:socket forKey:uuid];
	
	socket->context.version = 0;
	socket->context.info = (__bridge void *)socket;
	socket->context.retain = nil;
	socket->context.release = nil;
	socket->context.copyDescription = nil;

	if ([type isEqual: @"udp"]) {
		socket->socket = CFSocketCreate(kCFAllocatorDefault,
																		PF_INET,
																		SOCK_DGRAM,
																		IPPROTO_UDP,
																		kCFSocketReadCallBack|kCFSocketWriteCallBack,
																		(CFSocketCallBack)&MyCFSocketCallback,
																		&socket->context);
	}
	
	socket->onEvent = ^(NSString *type, NSString *data) {
		[self.bridge.eventDispatcher sendDeviceEventWithName:uuid
																										body:@{@"type":type, @"data":data}
		 ];
	};
	
	socket->onClose = ^{
		[mSockets removeObjectForKey:uuid];
	};

	//int reuseOn = 1;
	//setsockopt(CFSocketGetNative(theSocket4), SOL_SOCKET, SO_REUSEADDR, &reuseOn, sizeof(reuseOn));
	
	CFRunLoopSourceRef rls = CFSocketCreateRunLoopSource(NULL, socket->socket, 0);
	CFRunLoopAddSource([[NSRunLoop mainRunLoop] getCFRunLoop], rls, kCFRunLoopDefaultMode);
	CFRelease(rls);
}

@end
