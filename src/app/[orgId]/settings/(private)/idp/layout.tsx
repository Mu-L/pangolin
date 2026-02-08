interface LayoutProps {
    children: React.ReactNode;
    params: Promise<{}>;
}

export default async function Layout(props: LayoutProps) {
    return props.children;
}
