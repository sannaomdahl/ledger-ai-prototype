import { cn } from "cn"

import { Item, ItemMedia } from "@/components/ui/item"

interface LogoProps {
  className?: string
}

function AuthLogo({ className }: LogoProps) {
  return (
    <Item
      className={cn(
        "p-0",
        "bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center",
        className
      )}
      aria-hidden="true"
    >
      <ItemMedia variant="icon" className="size-auto">
        <svg
          viewBox="7.76 7.46 64.48 65.08"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="size-4"
        >
          <path
            d="M45.3732 7.46301C47.0217 7.46303 48.3698 8.80133 48.2451 10.4452C47.924 14.6769 46.921 18.838 45.2679 22.7703C44.5222 24.5441 43.6495 26.2586 42.6581 27.9015C41.5217 29.7849 40.9535 30.7266 41.2962 31.3336C41.6389 31.9406 42.6861 31.9406 44.7806 31.9406H69.2538C70.5933 31.9406 71.7268 32.8229 72.1048 34.038C72.192 34.3182 72.2388 34.6167 72.2388 34.9257V44.7884C72.2388 46.437 70.8976 47.7547 69.2611 47.953C67.032 48.2231 64.8451 48.7956 62.7621 49.6584C59.7576 50.9029 57.0273 52.7273 54.7278 55.0269C52.4283 57.3264 50.6041 60.0564 49.3596 63.0609C48.4968 65.1439 47.9243 67.3307 47.6542 69.5599C47.456 71.1964 46.1382 72.5376 44.4896 72.5376H34.6269C32.9783 72.5376 31.6303 71.1993 31.7514 69.5552C32.0689 65.245 33.0733 61.0065 34.7321 57.0018C35.5218 55.0954 36.4539 53.2566 37.5184 51.4999C38.658 49.6193 39.2278 48.6791 38.8853 48.071C38.5428 47.463 37.4951 47.463 35.3997 47.463H10.7463C9.09769 47.463 7.76123 46.1266 7.76123 44.4779V34.8482C7.76123 33.1995 9.10232 31.8812 10.7393 31.6858C12.9684 31.4198 15.155 30.8557 17.238 30.0056C20.2425 28.7794 22.9725 26.9821 25.272 24.7164C27.5716 22.4506 29.3957 19.7608 30.6402 16.8004C31.4973 14.7615 32.0681 12.6219 32.3403 10.4405C32.5444 8.80458 33.8619 7.46301 35.5105 7.46301H45.3732Z"
            fill="currentColor"
          />
        </svg>
      </ItemMedia>
    </Item>
  )
}

function Logo({ className }: LogoProps) {
  return (
    <span
      className={cn(
        "relative flex size-7 shrink-0 items-center justify-center",
        className
      )}
    >
      <AuthLogo className="absolute top-1/2 left-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.875]" />
    </span>
  )
}

export { Logo }