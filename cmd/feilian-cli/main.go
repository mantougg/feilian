// feilian-cli 是引擎联调工具：不起 UI，终端打印引擎事件 + stdin 发消息。
// 用法（两个终端各起一个即可互发现互发）：
//
//	go run ./cmd/feilian-cli -nick 测试A
//	go run ./cmd/feilian-cli -nick 测试B -port 2426   // 同机双开时第二实例换端口
//
// 发消息：输入「IP[:端口] 消息内容」回车；同机双开且第二实例换了端口时，
// 直接用对方日志里显示的完整地址。Ctrl+C 广播下线包后退出。
package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"

	"feilian/engine"
)

func main() {
	nick := flag.String("nick", "", "昵称（缺省用主机名）")
	dept := flag.String("dept", "未分组", "部门")
	port := flag.Int("port", 2425, "监听端口（同机双开时第二实例须换端口）")
	to := flag.String("to", "", "冒烟模式：向 ip[:port] 发一条消息后退出")
	flag.Parse()

	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "unknown-host"
	}
	name := *nick
	if name == "" {
		name = hostname
	}

	events := make(chan engine.Event, 64)
	e := engine.New(engine.Config{
		Nick:     name,
		Hostname: hostname,
		Dept:     *dept,
		Port:     *port,
	}, events)
	if err := e.Start(); err != nil {
		fmt.Fprintln(os.Stderr, "引擎启动失败:", err)
		os.Exit(1)
	}
	// stdin 结束（管道关闭）或正常返回时广播 CmdBrExit，让对端立即下线
	defer e.Stop()

	go printEvents(events)

	// Ctrl+C：广播 CmdBrExit 让对端立即下线，再退出进程
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt)
	go func() {
		<-sig
		fmt.Println("\n下线中…")
		e.Stop()
		os.Exit(0)
	}()

	if *to != "" {
		if err := e.SendText(*to, "冒烟测试消息（feilian-cli）"); err != nil {
			fmt.Fprintln(os.Stderr, "发送失败:", err)
			os.Exit(1)
		}
		fmt.Println("已发送到", *to)
		return
	}

	fmt.Printf("飞联 CLI｜昵称 %s｜主机 %s｜端口 %d\n输入「IP[:端口] 消息内容」发送，Ctrl+C 下线退出。\n", name, hostname, *port)
	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		dst, text, ok := strings.Cut(line, " ")
		if !ok {
			fmt.Println("格式：IP[:端口] 消息内容")
			continue
		}
		if err := e.SendText(strings.TrimSpace(dst), strings.TrimSpace(text)); err != nil {
			fmt.Println("发送失败:", err)
		}
	}
}

// printEvents 把引擎事件翻译成人话打印到终端。
func printEvents(events <-chan engine.Event) {
	for ev := range events {
		switch ev.Type {
		case engine.EventPeerOnline:
			fmt.Printf("[上线] %s（%s:%d｜主机 %s｜部门 %s｜状态 %s）\n",
				ev.Peer.Nick, ev.Peer.IP, ev.Peer.Port, ev.Peer.Host, ev.Peer.Dept, ev.Peer.Status)
		case engine.EventPeerOffline:
			fmt.Printf("[下线] %s（%s）\n", ev.Peer.Nick, ev.Peer.IP)
		case engine.EventPeerUpdate:
			fmt.Printf("[更新] %s｜状态 %s｜部门 %s\n", ev.Peer.Nick, ev.Peer.Status, ev.Peer.Dept)
		case engine.EventMessage:
			fmt.Printf("[消息] 来自 %s（%s:%d）：%s\n", ev.Peer.Nick, ev.Peer.IP, ev.Peer.Port, ev.Text)
		case engine.EventReceipt:
			fmt.Printf("[回执] 消息 %s 已送达\n", ev.MsgID)
		case engine.EventEngineError:
			fmt.Printf("[错误] %s\n", ev.Text)
		}
	}
}
