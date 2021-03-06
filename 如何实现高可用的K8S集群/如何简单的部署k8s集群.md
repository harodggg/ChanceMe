# 						如何做到可用的k8s部署

## 1. 安装 k8s 的基础组件

安装 k8s 的最低要求见 https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/#before-you-begin :

- 要求 2CPU 和 2 GB

- 不能启用 swap

- 外网可通

- …

- 任选一台机器作 k8s master 节点，后面所有的安装如果没有特殊标明都在 master 上执行，使用 sudo 命令或 root 用户依次执行下面的命令完成以下各个组件的安装:


```
apt-get update && apt-get install -y apt-transport-https
curl https://mirrors.aliyun.com/kubernetes/apt/doc/apt-key.gpg | apt-key add - 
cat << EOF > /etc/apt/sources.list.d/kubernetes.list
deb https://mirrors.aliyun.com/kubernetes/apt/ kubernetes-xenial main
EOF
apt-get update
apt-get install -y kubelet kubeadm kubectl
systemctl daemon-reload
systemctl restart kubelet
```



## 2. k8s初始化前系统环境配置

### 2.1 防火墙，selinux,swap配置

部署文档上都有说明原因。

#### 2.1.1 关于防火墙的原因（nftables后端兼容性问题，产生重复的防火墙规则）

> The`iptables`tooling can act as a compatibility layer, behaving like iptables but actually configuring nftables. This nftables backend is not compatible with the current kubeadm packages: it causes duplicated firewall rules and breaks`kube-proxy`.

关闭防火墙：(ubuntu18.04,ufw) ( not ubuntu , firewalld )
```bash
systemctl stop ufw
systemctl disable ufw
systemctl status ufw 
```

#### 2.1.2 关于selinux的原因（关闭selinux以允许容器访问宿主机的文件系统）

> Setting SELinux in permissive mode by running`setenforce 0`and`sed ...`effectively disables it. This is required to allow containers to access the host filesystem, which is needed by pod networks for example. You have to do this until SELinux support is improved in the kubelet.

关闭SELinux：

```bash
setenforce 0 临时禁用

永久禁用：
vi /etc/selinux/config    
SELINUX=disabled

```

#### 2.1.3 关于关掉swap的原因
指的是一个交换分区或文件。关闭swap主要是为了性能考虑
关闭swap：

```bash
swapoff -a  临时关闭

永久关闭swap分区:
sed -ri 's/.*swap.*/#&/' /etc/fstab
```

### 2.2 修改主机名字


```
 方案1
 hostnamectl set-hostname master01
 more /etc/hostname 
 方案2
 sudo echo master > /etc/hostname
 
```

退出重新登陆即可显示新设置的主机名master

### 2.3  修改host文件

```
cat >> /etc/hosts << EOF
34.66.229.255 master
35.223.89.70 woker01
34.71.175.171 woker02
34.66.169.110 woker03
EOF
34.66.229.255
```

### 2.4 验证mac地址uuid

```
cat /sys/class/net/ens4/address
cat /sys/class/dmi/id/product_uuid
```

保证各节点mac和uuid唯一

###  2.5 免密登录

配置master到worker(1,3)免密登录，本步骤只在master上执行。

 创建秘钥

```bash
 ssh-keygen -t rsa
```

将秘钥同步至woker

```bash
ssh-copy-id -i /root/.ssh/id_rsa.pub root@
```

测试免密登入

```bash
ssh woker02
```

master可以直接登录woker01和woker02，不需要输入密码。

# 3. Docker安装

control plane和work节点都执行本部分操作。

 安装依赖包

```
sudo apt install docker.io
```

 设置Docker源

 安装Docker CE

 启动Docker

```
systemctl start docker
systemctl enable docker
```

# 4. 修改cgroup

修改daemon.json

修改daemon.json

```bash
more /etc/docker/daemon.json 
{
  "registry-mirrors": ["https://v16stybc.mirror.aliyuncs.com"],
  "exec-opts": ["native.cgroupdriver=systemd"]
}
```

 重新加载docker

```bash
systemctl daemon-reload
systemctl restart docker
```

修改cgroupdriver是为了消除告警：
[WARNING IsDockerSystemdCheck]: detected "cgroupfs" as the Docker cgroup driver. The recommended driver is "systemd". Please follow the guide at https://kubernetes.io/docs/setup/cri/

#   5. 镜像加速

由于Docker Hub的服务器在国外，下载镜像会比较慢，可以配置镜像加速器。主要的加速器有：Docker官方提供的中国registry mirror、阿里云加速器、DaoCloud 加速器，本文以阿里加速器配置为例。

## 5.2  登陆阿里云容器模块

登陆地址为：[https://cr.console.aliyun.com](https://cr.console.aliyun.com/) ,未注册的可以先注册阿里云账户

## 5.3 配置镜像加速器

**配置daemon.json文件**

```
mkdir -p /etc/docker
tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://v16stybc.mirror.aliyuncs.com"]
}
EOF
```

**重启服务**

```
systemctl daemon-reload
systemctl restart docker
```

加速器配置完成

# 6. keepalived安装（主备模式）

keepalive是一款可以实现高可靠的软件，通常部署在2台服务器上，分为一主一备。Keepalived可以对本机上的进程进行检测，一旦Master(主)检测出某个进程出现问题，将自己切换成Backup(副)状态，然后通知另外一个节点切换成Master(主)状态。

control plane节点都执行本部分操作。

## 5.1  安装keepalived

```
 sudo apt  -y install keepalived
```


## 5.2  keepalived配置

**master上keepalived配置：**

```
more /etc/keepalived/keepalived.conf 
! Configuration File for keepalived
global_defs {
   router_id master01
}
vrrp_instance VI_1 {
    state MASTER 
    interface ens160
    virtual_router_id 50
    priority 100
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass 1111
    }
    virtual_ipaddress {
        172.27.34.130
    }
}
```

**master 1上keepalived配置：**

```
more /etc/keepalived/keepalived.conf 
! Configuration File for keepalived
global_defs {
   router_id master02
}
vrrp_instance VI_1 {
    state BACKUP 
    interface ens160
    virtual_router_id 50
    priority 90
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass 1111
    }
    virtual_ipaddress {
        172.27.34.130
    }
}
```

**master02上keepalived配置：**

```
more /etc/keepalived/keepalived.conf 
! Configuration File for keepalived
global_defs {
   router_id master03
}
vrrp_instance VI_1 {
    state BACKUP 
    interface ens160
    virtual_router_id 50
    priority 80
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass 1111
    }
    virtual_ipaddress {
        172.27.34.130
    }
```

## 5.3  启动keepalived

所有control plane启动keepalived服务并设置开机启动

```
service keepalived start
systemctl enable keepalived
```

## 5 安装 k8s 依赖的各种镜像

# 6. 初始化Master

master01节点执行本部分操作。

## 6.1 kubeadm.conf

```bash
apiVersion: kubeadm.k8s.io/v1beta2
kind: ClusterConfiguration
kubernetesVersion: v1.16.4
apiServer:
  certSANs:    #填写所有kube-apiserver节点的hostname、IP、VIP
  - master
  - woker01
  - woker02
  - woker03
  - 34.70.29.252
  - 35.223.89.70 
  - 34.71.175.171 
  - 34.66.169.110 
controlPlaneEndpoint: "34.70.29.252:6443"
networking:
  podSubnet: "10.244.0.0/16"
```

kubeadm.conf为初始化的配置文件

## 6.2 master初始化

```
kubeadm init --config=kubeadm.conf
```

![图片.png](https://segmentfault.com/img/remote/1460000021498589)

记录kubeadm join的输出，后面需要这个命令将work节点和其他control plane节点加入集群中。



**初始化失败：**

如果初始化失败，可执行kubeadm reset后重新初始化

```bash
kubeadm reset
rm -rf $HOME/.kube/config
```

c这里我们通过 `--image-repository` 指定了一个国内的镜像，因为 google 官方镜像被国内无法访问，并且指定了 `--pod-network-cidr` 网络情况，这是因为后面我们的组件使用的是 `Calico`这个网络组件，所有这些都不用去在乎它们是什么，只要先按部就班的安装。

安装完成之后会有如下的输出：


## 6.3 安装 Calico 网络组件

k8s 的网络组件非常多，为了演示方便我们使用 Calico: above 1.16

```bash
kubectl apply -f https://docs.projectcalico.org/v3.9/manifests/calico.yaml
```

#  7 重新设置k8s（master执行）

```bash
kubeadm reset
```

# 8 日志

```bash
journalctl -f -u kubelet.service
```



# 9 扩展-istio

## 9.1 为什么使用 Istio？

通过负载均衡、服务间的身份验证、监控等方法，Istio 可以轻松地创建一个已经部署了服务的网络，而服务的代码只需[很少](https://istio.io/latest/zh/docs/tasks/observability/distributed-tracing/overview/#trace-context-propagation)更改甚至无需更改。通过在整个环境中部署一个特殊的 sidecar 代理为服务添加 Istio 的支持，而代理会拦截微服务之间的所有网络通信，然后使用其控制平面的功能来配置和管理 Istio，这包括：

- 为 HTTP、gRPC、WebSocket 和 TCP 流量自动负载均衡。
- 通过丰富的路由规则、重试、故障转移和故障注入对流量行为进行细粒度控制。
- 可插拔的策略层和配置 API，支持访问控制、速率限制和配额。
- 集群内（包括集群的入口和出口）所有流量的自动化度量、日志记录和追踪。
- 在具有强大的基于身份验证和授权的集群中实现安全的服务间通信。

Istio 为可扩展性而设计，可以满足不同的部署需求。

## 9.2 核心特性

Istio 以统一的方式提供了许多跨服务网络的关键功能：

### 9.3 流量管理

Istio 简单的规则配置和流量路由允许您控制服务之间的流量和 API 调用过程。Istio 简化了服务级属性（如熔断器、超时和重试）的配置，并且让它轻而易举的执行重要的任务（如 A/B 测试、金丝雀发布和按流量百分比划分的分阶段发布）。

有了更好的对流量的可视性和开箱即用的故障恢复特性，您就可以在问题产生之前捕获它们，无论面对什么情况都可以使调用更可靠，网络更健壮。

请参考[流量管理文档](https://istio.io/latest/zh/docs/concepts/traffic-management/)获取更多细节。

### 9.4 安全

Istio 的安全特性解放了开发人员，使其只需要专注于应用程序级别的安全。Istio 提供了底层的安全通信通道，并为大规模的服务通信管理认证、授权和加密。有了 Istio，服务通信在默认情况下就是受保护的，可以让您在跨不同协议和运行时的情况下实施一致的策略——而所有这些都只需要很少甚至不需要修改应用程序。

Istio 是独立于平台的，可以与 Kubernetes（或基础设施）的网络策略一起使用。但它更强大，能够在网络和应用层面保护pod到 pod 或者服务到服务之间的通信。

请参考[安全文档](https://istio.io/latest/zh/docs/concepts/security/)获取更多细节。

### 9.5 可观察性

Istio 健壮的追踪、监控和日志特性让您能够深入的了解服务网格部署。通过 Istio 的监控能力，可以真正的了解到服务的性能是如何影响上游和下游的；而它的定制 Dashboard 提供了对所有服务性能的可视化能力，并让您看到它如何影响其他进程。

Istio 的 Mixer 组件负责策略控制和遥测数据收集。它提供了后端抽象和中介，将一部分 Istio 与后端的基础设施实现细节隔离开来，并为运维人员提供了对网格与后端基础实施之间交互的细粒度控制。

所有这些特性都使您能够更有效地设置、监控和加强服务的 SLO。当然，底线是您可以快速有效地检测到并修复出现的问题。

请参考[可观察性文档](https://istio.io/latest/zh/docs/concepts/observability/)获取更多细节。

## 9.6 平台支持

Istio 独立于平台，被设计为可以在各种环境中运行，包括跨云、内部环境、Kubernetes、Mesos 等等。您可以在 Kubernetes 或是装有 Consul 的 Nomad 环境上部署 Istio。Istio 目前支持：

- Kubernetes 上的服务部署
- 基于 Consul 的服务注册
- 服务运行在独立的虚拟机上

## 9.7 整合和定制

Istio 的策略实施组件可以扩展和定制，与现有的 ACL、日志、监控、配额、审查等解决方案集成。